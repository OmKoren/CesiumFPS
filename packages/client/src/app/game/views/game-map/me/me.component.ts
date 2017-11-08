import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActionType, CesiumService } from 'angular-cesium';
import { CharacterService, CharacterState, MeModelState, ViewState } from '../../../services/character.service';
import { UtilsService } from '../../../services/utils.service';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/combineLatest';
import 'rxjs/add/observable/fromEvent';
import { Subscription } from 'rxjs/Subscription';
import { GameService } from '../../../services/game.service';
import { CharacterData } from '../../../../types';
import { BasicDesc } from 'angular-cesium/src/angular-cesium/services/basic-desc/basic-desc.service';
import { OtherPlayerEntity } from '../../game-container/game-container.component';
import { KeyboardKeysService } from '../../../../core/services/keyboard-keys.service';
import { GunSoundComponent } from '../../gun-shot-sound/gun-sound/gun-sound.component';

@Component({
  selector: 'me',
  templateUrl: './me.component.html',
  styleUrls: ['./me.component.scss'],
})
export class MeComponent implements OnInit, OnDestroy {

  private meModelDrawSubscription: Subscription;

  @ViewChild('cross') crossElement: ElementRef;
  @ViewChild('gunShotSound') gunShotSound: GunSoundComponent;
  @ViewChild('muzzleFlash') muzzleFlash: ElementRef;
  @ViewChild('meModel') meModel: BasicDesc;

  showWeapon$: Observable<boolean>;
  showCross$: Observable<boolean>;
  shootSub$: Subscription;
  buildingNearby = false;
  insideBuilding = false;
  transparentColor = new Cesium.Color(0, 0, 0, 0.0001);
  normalColor = new Cesium.Color(1, 1, 1, 1);
  ViewState = ViewState;

  constructor(private character: CharacterService,
              public utils: UtilsService,
              private cesiumService: CesiumService,
              private gameService: GameService,
              private keyboardKeysService: KeyboardKeysService,
              private cd: ChangeDetectorRef) {
  }

  get notifications$() {
    return this.character.state$.filter(f => f !== null).map(meState => ({
      actionType: ActionType.ADD_UPDATE,
      id: meState.id,
      entity: meState,
    }));
  }

  setShootEvent() {
    this.keyboardKeysService.registerKeyBoardEventDescription('LeftMouse', 'Shoot');
    const enterSub$ = Observable.create((observer) => {
      this.keyboardKeysService.registerKeyBoardEvent('Enter', 'Shoot', () => {
        observer.next()
      });
    });
    this.shootSub$ = Observable.fromEvent(document.body, 'click')
      .merge(enterSub$)
      .filter(() => this.character.state === MeModelState.SHOOTING)
      .do(() => this.gameService.notifyShot(this.character.meFromServer.id, this.character.location))
      .subscribe((e: MouseEvent) => {
        this.showGunMuzzleFlash();
        this.soundGunFire();
        const crossElement = this.crossElement.nativeElement;
        const crossLocation = {
          x: crossElement.x + crossElement.width / 2,
          y: crossElement.y + crossElement.height / 2,
        };
        const picked = this.cesiumService.getScene().pick(crossLocation);
        if (picked && picked.id && picked.id.acEntity && picked.id.acEntity instanceof OtherPlayerEntity) {
          const shotedEntity = picked.id.acEntity;
          const killSubscription = this.gameService.notifyKill(shotedEntity.id)
            .subscribe(() => killSubscription.unsubscribe());
        }
      });
  }

  ngOnInit(): void {
    this.showWeapon$ = Observable.combineLatest(
      this.character.viewState$.map(viewState => viewState === ViewState.FPV),
      this.character.state$.map(meState => meState && meState.state === MeModelState.SHOOTING))
      .map((result => result[0] || result[1]));
    this.showCross$ = this.character.state$.map(meState => meState && meState.state === MeModelState.SHOOTING);
    this.meModelDrawSubscription = this.meModel.onDraw.subscribe(entity => {
      this.character.entity = entity.cesiumEntity;
    });

    this.setShootEvent();
    this.character.state$.subscribe(state => {
      if (state && this.buildingNearby !== !!state.nearbyBuildingPosition) {
        this.buildingNearby = !!state.nearbyBuildingPosition;
        this.cd.detectChanges();
      }
      if (state && this.insideBuilding !== !!state.enteredBuilding) {
        this.insideBuilding = !!state.enteredBuilding;
        this.cd.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.shootSub$.unsubscribe();
    this.meModelDrawSubscription.unsubscribe();
  }

  private soundGunFire() {
    this.gunShotSound.play();
  }

  private showGunMuzzleFlash() {
    this.muzzleFlash.nativeElement.style.visibility = 'visible';
    setTimeout(() => this.muzzleFlash.nativeElement.style.visibility = 'hidden', 20);
  }

  canvasPropagation() {
    this.cesiumService.getViewer().canvas.click();
  }

  getOrientation(location, heading: number, player: CharacterState) {
    if (player.state === MeModelState.DEAD) {
      return this.utils.getOrientation(location, heading, 0, 90);
    } else {
      return this.utils.getOrientation(location, heading);
    }
  }

  get characterInfo(): CharacterData {
    return this.character.currentStateValue.characterInfo;
  }

  getColor() {
    if (this.character.viewState === ViewState.FPV) {
      return this.transparentColor;
    }
    return this.normalColor;
  }

  showMeModel() {
    return this.character.viewState !== ViewState.OVERVIEW && this.character.state !== MeModelState.CONTROLLED;
  }

  getPosition(location: Cartesian3) {
    // put height in conf...
    const characterName = this.character.currentStateValue.characterInfo.name;
    if (characterName === 'Wolverine' || characterName === 'The Flash') {
      return this.utils.toFixedHeight(location, 1)
    }
    return location;
  }

  getHeightReference(){
    const characterName = this.character.currentStateValue.characterInfo.name;
    if (characterName === 'Wolverine' || characterName === 'The Flash') {
      return Cesium.HeightReference.NONE;
    }
    return this.utils.getClampedToGroundHeightReference();
  }
}
