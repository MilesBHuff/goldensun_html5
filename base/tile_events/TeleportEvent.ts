import {base_actions, directions, get_centered_pos_in_px, reverse_directions} from "../utils";
import {event_types, TileEvent} from "./TileEvent";
import * as _ from "lodash";
import {RevealFieldPsynergy} from "../field_abilities/RevealFieldPsynergy";

export class TeleportEvent extends TileEvent {
    private target: string;
    private x_target: number;
    private y_target: number;
    private _open_door: boolean;
    private dest_collision_layer: number;
    private destination_direction: string;
    private keep_encounter_cumulator: boolean;

    constructor(
        game,
        data,
        x,
        y,
        activation_directions,
        activation_collision_layers,
        active,
        active_storage_key,
        affected_by_reveal,
        key_name: string,
        target,
        x_target,
        y_target,
        open_door,
        dest_collision_layer,
        destination_direction,
        keep_encounter_cumulator
    ) {
        super(
            game,
            data,
            event_types.TELEPORT,
            x,
            y,
            activation_directions,
            activation_collision_layers,
            active,
            active_storage_key,
            null,
            affected_by_reveal,
            key_name
        );
        this.target = target;
        this.x_target = x_target;
        this.y_target = y_target;
        this._open_door = open_door ?? false;
        this.dest_collision_layer = dest_collision_layer ?? 0;
        this.destination_direction = destination_direction;
        this.keep_encounter_cumulator = keep_encounter_cumulator;
    }

    get open_door() {
        return this._open_door;
    }

    fire() {
        if (!this.check_position() || !this.data.hero_movement_allowed()) {
            return;
        }
        this.data.tile_event_manager.on_event = true;
        this.data.hero.teleporting = true;
        if (this.open_door) {
            this.data.audio.play_se("door/open_door");
            if (!this.data.hero.stop_by_colliding) {
                this.data.tile_event_manager.on_event = false;
                this.data.hero.teleporting = false;
                return;
            }
            this.data.hero.play(base_actions.WALK, reverse_directions[directions.up]);
            this.set_open_door_tile();
            this.game.physics.p2.pause();
            const time = 400;
            const tween_x = this.data.map.tile_width * (this.x + 0.5);
            const tween_y = this.data.hero.sprite.y - 15;
            this.game.add.tween(this.data.hero.shadow).to(
                {
                    x: tween_x,
                    y: tween_y,
                },
                time,
                Phaser.Easing.Linear.None,
                true
            );
            this.game.add
                .tween(this.data.hero.sprite.body)
                .to(
                    {
                        x: tween_x,
                        y: tween_y,
                    },
                    time,
                    Phaser.Easing.Linear.None,
                    true
                )
                .onComplete.addOnce(() => {
                    this.camera_fade_in();
                });
        } else {
            this.data.audio.play_se("door/default");
            this.camera_fade_in();
        }
    }

    private camera_fade_in() {
        this.data.hero.stop_char(true);
        this.game.camera.fade(undefined, undefined, true);
        this.game.camera.onFadeComplete.addOnce(() => {
            if (this.data.hero.on_reveal) {
                (this.data.info.field_abilities_list.reveal as RevealFieldPsynergy).finish(true);
            }
            const destination_direction =
                directions[this.destination_direction] !== undefined
                    ? directions[this.destination_direction]
                    : this.activation_directions[0];
            this.data.hero.set_direction(destination_direction);
            this.data.hero.play(base_actions.IDLE, reverse_directions[this.data.hero.current_direction]);
            this.game.camera.lerp.setTo(1, 1);
            this.change_map();
        });
    }

    private async change_map() {
        const next_map_key_name = this.target;
        const target_collision_layer = this.dest_collision_layer;
        this.data.hero.set_collision_layer(target_collision_layer);
        this.data.map.unset_map();
        const encounter_cumulator = this.keep_encounter_cumulator ? this.data.map.encounter_cumulator : undefined;
        this.data.map = await this.data.info.maps_list[next_map_key_name].mount_map(
            target_collision_layer,
            encounter_cumulator
        );
        this.data.map.set_map_bounds(this.x_target, this.y_target);
        this.data.collision.config_collision_groups(this.data.map);
        this.data.map.config_all_bodies(this.data.map.collision_layer);
        this.data.collision.config_collisions(this.data.map.collision_layer);
        this.game.physics.p2.updateBoundsCollisionGroup();
        if (!this.data.electron_app) {
            this.data.debug.update_debug_physics(this.data.hero.sprite.body.debug);
        }
        this.data.hero.sprite.body.x = get_centered_pos_in_px(this.x_target, this.data.map.tile_width);
        this.data.hero.sprite.body.y = get_centered_pos_in_px(this.y_target, this.data.map.tile_height);
        this.game.physics.p2.resume();
        this.camera_fade_out();
    }

    private camera_fade_out() {
        this.data.hero.update_shadow();
        this.data.hero.update_tile_position();
        this.data.hero.update_half_crop(true);
        this.data.map.sort_sprites();
        this.data.map.npcs.forEach(npc => npc.update());
        this.game.camera.flash(0x0, undefined, true);
        this.game.camera.onFlashComplete.addOnce(() => {
            this.data.camera.reset_lerp();
            this.data.tile_event_manager.on_event = false;
            this.data.hero.teleporting = false;
            this.data.map.fire_game_events();
        });
    }

    private set_open_door_tile() {
        const layer = _.find(this.data.map.sprite.layers, {
            name: this.data.map.sprite.properties.door_layer,
        });
        const sample_tile = this.data.map.sprite.getTile(this.x, this.y - 1, layer.name);
        const door_type_index = sample_tile.properties.door_type;
        const tiles = _.filter(this.data.map.sprite.tilesets[0].tileProperties, key => {
            return key.door_type === door_type_index && "close_door" in key && key.id === sample_tile.properties.id;
        });
        let tile, source_index, close_door_index, offsets, base_x, base_y, target_index;
        for (let i = 0; i < tiles.length; ++i) {
            tile = tiles[i];
            source_index = (tile.index | 0) + 1;
            close_door_index = tile.close_door;
            offsets = tile.base_offset.split(",");
            base_x = this.x + (offsets[0] | 0);
            base_y = this.y + (offsets[1] | 0) - 1;
            target_index =
                parseInt(
                    _.findKey(this.data.map.sprite.tilesets[0].tileProperties, {
                        open_door: close_door_index,
                    })
                ) + 1;
            this.data.map.sprite.replace(source_index, target_index, base_x, base_y, 1, 1, layer.name);
        }
    }

    destroy() {
        this._origin_interactable_object = null;
        this.deactivate();
    }
}
