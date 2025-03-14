import {GameEvent} from "./game_events/GameEvent";
import {
    directions_angles,
    get_sqr_distance,
    get_tile_position,
    mount_collision_polygon,
    next_px_step,
    range_360,
} from "./utils";
import {ControllableChar} from "./ControllableChar";
import {interaction_patterns} from "./game_events/GameEventManager";
import {Map} from "./Map";
import * as numbers from "./magic_numbers";
import * as _ from "lodash";
import {SnapshotData} from "./Snapshot";

export enum npc_movement_types {
    IDLE = "idle",
    RANDOM = "random",
}

export enum npc_types {
    NORMAL = "normal",
    INN = "inn",
    SHOP = "shop",
    SPRITE = "sprite",
    HEALER = "healer",
}

/** The NPC class. */
export class NPC extends ControllableChar {
    private static readonly NPC_TALK_RANGE = 21;
    private static readonly MAX_DIR_GET_TRIES = 7;
    private static readonly STOP_MINIMAL_DISTANCE_SQR = 2 * 2;

    private _movement_type: npc_movement_types;
    private _npc_type: npc_types;
    private _message: string;
    private _thought_message: string;
    private _avatar: string;
    private _voice_key: string;
    private _base_collision_layer: number;
    private _talk_range: number;
    private _events: GameEvent[];
    private _shop_key: string;
    private _inn_key: string;
    private _healer_key: string;
    private no_shadow: boolean;
    private _ignore_world_map_scale: boolean;
    private anchor_x: number;
    private anchor_y: number;
    private scale_x: number;
    private scale_y: number;
    private _interaction_pattern: interaction_patterns;
    private _affected_by_reveal: boolean;
    private _label: string;
    protected storage_keys: {
        position?: string;
        action?: string;
        animation?: string;
        base_collision_layer?: string;
        affected_by_reveal?: string;
        visible?: string;
        movement_type?: string;
    };
    private sprite_misc_db_key: string;
    private ignore_physics: boolean;
    private _initial_x: number;
    private _initial_y: number;
    private _angle_direction: number;
    private _max_distance: number;
    private _step_duration: number;
    private _wait_duration: number;
    private _step_frame_counter: number;
    private _stepping: boolean;
    private _base_step: number;
    private _step_max_variation: number;
    private _step_destination: {x: number; y: number};
    private initially_visible: boolean;
    private previous_visible_state: boolean;
    private _snapshot_info: SnapshotData["map_data"]["npcs"][0];

    constructor(
        game,
        data,
        key_name,
        label,
        active,
        initial_x,
        initial_y,
        storage_keys,
        initial_action,
        initial_animation,
        enable_footsteps,
        walk_speed,
        dash_speed,
        climb_speed,
        npc_type,
        movement_type,
        message,
        thought_message,
        avatar,
        shop_key,
        inn_key,
        healer_key,
        base_collision_layer,
        talk_range,
        events_info,
        no_shadow,
        ignore_world_map_scale,
        anchor_x,
        anchor_y,
        scale_x,
        scale_y,
        interaction_pattern,
        affected_by_reveal,
        sprite_misc_db_key,
        ignore_physics,
        visible,
        voice_key,
        max_distance,
        step_duration,
        wait_duration,
        base_step,
        step_max_variation
    ) {
        super(
            game,
            data,
            key_name,
            enable_footsteps,
            walk_speed,
            dash_speed,
            climb_speed,
            true,
            initial_x,
            initial_y,
            initial_action,
            initial_animation,
            storage_keys,
            active
        );
        this._npc_type = npc_type ?? npc_types.NORMAL;
        if (this.storage_keys.movement_type !== undefined) {
            movement_type = this.data.storage.get(this.storage_keys.movement_type);
        }
        this._movement_type = movement_type ?? npc_movement_types.IDLE;
        this._message = message ?? "";
        this._thought_message = thought_message ?? "";
        this._avatar = avatar ?? null;
        this._voice_key = voice_key ?? "";
        this._shop_key = shop_key;
        this._inn_key = inn_key;
        this._healer_key = healer_key;
        if (this.storage_keys.base_collision_layer !== undefined) {
            base_collision_layer = this.data.storage.get(this.storage_keys.base_collision_layer);
        }
        this._base_collision_layer = base_collision_layer ?? 0;
        this._talk_range = talk_range ?? NPC.NPC_TALK_RANGE;
        this.no_shadow = no_shadow ?? false;
        this._ignore_world_map_scale = ignore_world_map_scale ?? false;
        this.anchor_x = anchor_x;
        this.anchor_y = anchor_y;
        this.scale_x = scale_x;
        this.scale_y = scale_y;
        this._interaction_pattern = interaction_pattern ?? interaction_patterns.NO_INTERACTION;
        if (this.storage_keys.affected_by_reveal !== undefined) {
            affected_by_reveal = this.data.storage.get(this.storage_keys.affected_by_reveal);
        }
        this._affected_by_reveal = affected_by_reveal ?? false;
        if (this.storage_keys.visible !== undefined) {
            visible = this.data.storage.get(this.storage_keys.visible);
        }
        this.initially_visible = visible ?? true;
        this.ignore_physics = ignore_physics ?? false;
        this._events = [];
        this.set_events(events_info ?? []);
        this.sprite_misc_db_key = sprite_misc_db_key;
        this._label = label;
        this._max_distance = max_distance;
        this._step_duration = step_duration;
        this._wait_duration = wait_duration ?? this._step_duration;
        this._step_frame_counter = 0;
        this._stepping = false;
        this._base_step = base_step;
        this._step_max_variation = step_max_variation;
    }

    /** The list of GameEvents related to this NPC. */
    get events() {
        return this._events;
    }
    /** The default interaction message of this NPC. */
    get message() {
        return this._message;
    }
    /** The default interaction message by using Mind Read of this NPC. */
    get thought_message() {
        return this._thought_message;
    }
    /** The avatar key of this NPC. */
    get avatar() {
        return this._avatar;
    }
    /** The unique label that identifies this NPC. */
    get label() {
        return this._label;
    }
    /** The voicec sound key of this NPC. */
    get voice_key() {
        return this._voice_key;
    }
    /** The type of interaction that this NPC provides when interacting with the hero. */
    get interaction_pattern() {
        return this._interaction_pattern;
    }
    /** The interaction range factor. Determines how far the hero need to be at least to start an interaction. */
    get talk_range() {
        return this._talk_range;
    }
    /** The collision layer that this NPC is. */
    get base_collision_layer() {
        return this._base_collision_layer;
    }
    /** The collision layer that this NPC is. */
    get collision_layer() {
        return this.base_collision_layer;
    }
    /** Whether this NPC is affected by Reveal psynergy or not. */
    get affected_by_reveal() {
        return this._affected_by_reveal;
    }
    /** If true, this NPC scale won't change when it's in World Map. */
    get ignore_world_map_scale() {
        return this._ignore_world_map_scale;
    }
    /** The type of this NPC. */
    get npc_type() {
        return this._npc_type;
    }
    /** If it's a shop NPC, returns the key of the shop that it owns. */
    get shop_key() {
        return this._shop_key;
    }
    /** If it's a Inn NPC, returns the key of the inn that it owns. */
    get inn_key() {
        return this._inn_key;
    }
    /** If it's a Healer NPC, returns the key of the healer establishment that it owns. */
    get healer_key() {
        return this._healer_key;
    }
    /** The type of movement of this NPC. Idle or random walk. */
    get movement_type() {
        return this._movement_type;
    }
    /** Returns the snapshot info of this NPC when the game is restored. */
    get snapshot_info() {
        return this._snapshot_info;
    }

    /**
     * Updates this NPC properties according to current storage values.
     */
    check_storage_keys() {
        if (this.storage_keys.base_collision_layer !== undefined) {
            const storage_value = this.data.storage.get(this.storage_keys.base_collision_layer);
            if (this.base_collision_layer !== storage_value) {
                this._base_collision_layer = storage_value as number;
            }
        }
        if (this.storage_keys.affected_by_reveal !== undefined) {
            const storage_value = this.data.storage.get(this.storage_keys.affected_by_reveal);
            if (this.affected_by_reveal !== storage_value) {
                this._affected_by_reveal = storage_value as boolean;
            }
        }
        if (this.storage_keys.visible !== undefined) {
            const storage_value = this.data.storage.get(this.storage_keys.visible);
            if (this.sprite?.visible !== storage_value) {
                this.sprite.visible = storage_value as boolean;
            }
        }
        if (this.storage_keys.movement_type !== undefined) {
            const storage_value = this.data.storage.get(this.storage_keys.movement_type);
            if (this.movement_type !== storage_value) {
                this._movement_type = storage_value as npc_movement_types;
            }
        }
    }

    /**
     * Initialize the Game Events related to this NPC.
     * @param events_info the events info json.
     */
    private set_events(events_info) {
        for (let i = 0; i < events_info.length; ++i) {
            const event = this.data.game_event_manager.get_event_instance(events_info[i]);
            this.events.push(event);
        }
    }

    /**
     * Changes the collision layer of this NPC.
     * @param destination_collision_layer the desitination collision layer index.
     * @param update_on_map whether you want this modification to propagate to map structure.
     */
    change_collision_layer(destination_collision_layer: number, update_on_map: boolean = true) {
        this.sprite.body.removeCollisionGroup(this.data.collision.npc_collision_groups[this.base_collision_layer]);
        this.sprite.body.setCollisionGroup(this.data.collision.npc_collision_groups[destination_collision_layer]);
        if (update_on_map) {
            this.data.map.update_body_tile(
                this.tile_x_pos,
                this.tile_y_pos,
                this.tile_x_pos,
                this.tile_y_pos,
                this.base_collision_layer,
                destination_collision_layer,
                this
            );
        }
        this._base_collision_layer = destination_collision_layer;
        this.sprite.base_collision_layer = destination_collision_layer;
    }

    /**
     * Updates the tile positions.
     */
    update_tile_position(update_on_map: boolean = true) {
        const new_x_pos = get_tile_position(this.x, this.data.map.tile_width);
        const new_y_pos = get_tile_position(this.y, this.data.map.tile_height);
        if (this.tile_x_pos === new_x_pos && this.tile_y_pos === new_y_pos) {
            return;
        }
        if (update_on_map) {
            this.data.map.update_body_tile(
                this.tile_x_pos,
                this.tile_y_pos,
                new_x_pos,
                new_y_pos,
                this.base_collision_layer,
                this.base_collision_layer,
                this
            );
        }
        this._tile_x_pos = new_x_pos;
        this._tile_y_pos = new_y_pos;
    }

    /**
     * Updates this NPC initial position.
     * @param x the x pos in px.
     * @param y the y pos in px.
     */
    update_initial_position(x: number, y: number) {
        this._initial_x = x;
        this._initial_y = y;
    }

    /**
     * The main update function of this NPC.
     */
    update() {
        if (!this.active) {
            return;
        }
        if (this.movement_type === npc_movement_types.IDLE) {
            this.stop_char(false);
        } else if (this.movement_type === npc_movement_types.RANDOM) {
            if (this._stepping && this._step_frame_counter < this._step_duration) {
                if (!this.set_speed_factors()) {
                    this._step_frame_counter = this._step_duration;
                } else {
                    this.choose_direction_by_speed();
                    this.set_direction();
                    this.choose_action_based_on_char_state();
                    this.calculate_speed();
                    this.apply_speed();
                    this.play_current_action(true);
                    if (
                        get_sqr_distance(this.x, this._step_destination.x, this.y, this._step_destination.y) <
                        NPC.STOP_MINIMAL_DISTANCE_SQR
                    ) {
                        this._step_frame_counter = this._step_duration;
                    }
                }
            } else if (!this._stepping && this._step_frame_counter < this._wait_duration) {
                this.stop_char(true);
            } else if (this._step_frame_counter >= (this._stepping ? this._step_duration : this._wait_duration)) {
                this._stepping = !this._stepping;
                if (this._stepping) {
                    if (!this.update_random_walk()) {
                        this._stepping = false;
                    }
                }
                this._step_frame_counter = 0;
            }
            this._step_frame_counter += 1;
        }
        this.update_shadow();
        this.update_tile_position();
    }

    /**
     * Sets the x-y speed values that this NPC is going to be using to move.
     * @returns Returns true if the speed values were set. Going towards a collision direction is not acceptable, then returns false.
     */
    private set_speed_factors() {
        for (let i = 0; i < this.game.physics.p2.world.narrowphase.contactEquations.length; ++i) {
            const contact = this.game.physics.p2.world.narrowphase.contactEquations[i];
            if (contact.bodyB === this.body.data && contact.bodyA === this.data.hero.body.data) {
                const normal = contact.normalA;
                const collision_angle = range_360(Math.atan2(normal[1], normal[0]));
                if (
                    this._angle_direction > collision_angle - numbers.degree90 &&
                    this._angle_direction < collision_angle + numbers.degree90
                ) {
                    //going towards the collision direction is not acceptable.
                    return false;
                }
            }
        }
        this.current_speed.x = this.force_diagonal_speed.x;
        this.current_speed.y = this.force_diagonal_speed.y;
        return true;
    }

    /**
     * Tries to find a direction for this NPC to move in the random walk.
     * @param flip_direction If true, this function will try to find directions in the opposite direction.
     * @returns Returns true if a direction to move was found.
     */
    private update_random_walk(flip_direction: boolean = false) {
        if (
            flip_direction ||
            get_sqr_distance(this.x, this._initial_x, this.y, this._initial_y) <= Math.pow(this._max_distance, 2)
        ) {
            for (let tries = 0; tries < NPC.MAX_DIR_GET_TRIES; ++tries) {
                const step_size = this._base_step + _.random(this._step_max_variation);
                let desired_direction;
                const r1 = (Math.random() * numbers.degree360) / 4;
                const r2 = (Math.random() * numbers.degree360) / 4;
                if (flip_direction) {
                    desired_direction = this._angle_direction + Math.PI + r1 - r2;
                } else {
                    desired_direction = this._angle_direction + r1 - r2;
                }
                const next_pos: {x: number; y: number} = next_px_step(this.x, this.y, step_size, desired_direction);

                const wall_avoiding_dist = _.mean([this.data.map.tile_width, this.data.map.tile_height]) / 2;

                const surrounding_constraints = [
                    {direction: desired_direction, step_size: step_size},
                    {direction: desired_direction, step_size: step_size + wall_avoiding_dist},
                    ...(flip_direction
                        ? []
                        : [{direction: desired_direction + numbers.degree45, step_size: step_size}]),
                    ...(flip_direction
                        ? []
                        : [{direction: desired_direction - numbers.degree45, step_size: step_size}]),
                ];

                surrounding_tests: {
                    for (let i = 0; i < surrounding_constraints.length; ++i) {
                        const constraint = surrounding_constraints[i];
                        const test_pos: {x: number; y: number} = next_px_step(
                            this.x,
                            this.y,
                            constraint.step_size,
                            constraint.direction
                        );
                        const test_pos_x_tile = get_tile_position(test_pos.x, this.data.map.tile_width);
                        const test_pos_y_tile = get_tile_position(test_pos.y, this.data.map.tile_height);
                        if (this.is_pos_colliding(test_pos_x_tile, test_pos_y_tile)) {
                            break surrounding_tests;
                        }
                    }
                    if (
                        get_sqr_distance(next_pos.x, this._initial_x, next_pos.y, this._initial_y) >
                        Math.pow(this._max_distance, 2)
                    ) {
                        break surrounding_tests;
                    }

                    this._step_destination = next_pos;
                    this._angle_direction = range_360(desired_direction);
                    const speed_vector = new Phaser.Point(next_pos.x - this.x, next_pos.y - this.y).normalize();
                    this.force_diagonal_speed.x = speed_vector.x;
                    this.force_diagonal_speed.y = speed_vector.y;
                    return true;
                }
            }
        }
        if (!flip_direction) {
            const dir_found = this.update_random_walk(true);
            if (!dir_found) {
                this._angle_direction = range_360(this._angle_direction + Math.PI);
            }
            return dir_found;
        }
        return false;
    }

    /**
     * Tests whether this NPC would collide in a given position.
     * @param tile_x_pos the tile x position.
     * @param tile_y_pos the tile y position.
     * @returns returns true if the NPC is going to collide.
     */
    is_pos_colliding(tile_x_pos: number, tile_y_pos: number) {
        if (this.data.map.is_tile_blocked(tile_x_pos, tile_y_pos, this.base_collision_layer)) {
            return true;
        }
        const instances_in_tile = this.data.map.get_tile_bodies(tile_x_pos, tile_y_pos);
        if (instances_in_tile.length && !instances_in_tile.includes(this)) {
            return true;
        }
        return tile_x_pos === this.data.hero.tile_x_pos && tile_y_pos === this.data.hero.tile_y_pos;
    }

    /**
     * Activates or deactivates this NPC.
     * @param active true, if you want to activate it.
     */
    toggle_active(active: boolean) {
        if (active) {
            this.sprite?.body?.collides(this.data.collision.hero_collision_group);
            if (this.sprite) {
                if (this.storage_keys.visible !== undefined) {
                    this.sprite.visible = this.data.storage.get(this.storage_keys.visible) as boolean;
                } else {
                    this.sprite.visible = this.previous_visible_state;
                }
            }
            if (this.shadow) {
                this.shadow.visible = true;
            }
            this._active = true;
        } else {
            this.sprite?.body?.removeCollisionGroup(this.data.collision.hero_collision_group);
            if (this.sprite) {
                this.previous_visible_state = this.sprite.visible;
                this.sprite.visible = false;
            }
            if (this.shadow) {
                this.shadow.visible = false;
            }
            this._active = false;
        }
    }

    /**
     * Initializes this NPC.
     * @param map the map that's being mounted.
     */
    init_npc(map: Map) {
        const npc_db = this.data.dbs.npc_db[this.key_name];
        const npc_sprite_info =
            this.sprite_misc_db_key !== undefined
                ? this.data.info.misc_sprite_base_list[this.sprite_misc_db_key]
                : this.data.info.npcs_sprite_base_list[this.key_name];
        if (!this.no_shadow) {
            this.set_shadow(this.data.middlelayer_group, {
                key_name: npc_db.shadow_key,
                shadow_anchor_x: npc_db.shadow_anchor_x,
                shadow_anchor_y: npc_db.shadow_anchor_y,
            });
            this.shadow_following = this.snapshot_info?.shadow_following ?? this.shadow_following;
            if (!this.shadow_following) {
                this.shadow.x = this.snapshot_info?.shadow.x ?? this.shadow.x;
                this.shadow.y = this.snapshot_info?.shadow.y ?? this.shadow.y;
            }
        }
        this.set_sprite(
            this.data.middlelayer_group,
            npc_sprite_info,
            this.base_collision_layer,
            map,
            this.anchor_x ?? npc_db.anchor_x,
            this.anchor_y ?? npc_db.anchor_y,
            this.scale_x ?? npc_db.scale_x,
            this.scale_y ?? npc_db.scale_y
        );
        this._initial_x = this.sprite.x;
        this._initial_y = this.sprite.y;
        this._angle_direction = directions_angles[this.current_direction];
        if (this.ignore_world_map_scale) {
            this.sprite.scale.setTo(1, 1);
            if (this.shadow) {
                this.shadow.scale.setTo(1, 1);
            }
        }
        if (this.affected_by_reveal || !this.initially_visible) {
            this.sprite.visible = false;
            this.previous_visible_state = this.sprite.visible;
        }
        this.sprite.is_npc = true;
        if (this.snapshot_info && this.snapshot_info.send_to_back !== null) {
            this.sprite.send_to_back = this.snapshot_info.send_to_back;
        }
        if (this.snapshot_info && this.snapshot_info.send_to_front !== null) {
            this.sprite.send_to_front = this.snapshot_info.send_to_front;
        }
        if (this.snapshot_info?.frame) {
            this.sprite.frameName = this.snapshot_info.frame;
        }
        if (!this.snapshot_info || this.snapshot_info.anim_is_playing) {
            this.play(this.current_action, this.current_animation);
        }
        if (this.snapshot_info?.color_filter_active) {
            this.manage_filter(this.color_filter, true);
            this.color_filter.gray = this.snapshot_info.color_filter_settings.gray;
            this.color_filter.colorize_intensity = this.snapshot_info.color_filter_settings.colorize_intensity;
            this.color_filter.colorize = this.snapshot_info.color_filter_settings.colorize;
            this.color_filter.hue_adjust = this.snapshot_info.color_filter_settings.hue_adjust;
            this.color_filter.tint = this.snapshot_info.color_filter_settings.tint;
            this.color_filter.flame = this.snapshot_info.color_filter_settings.flame;
            this.color_filter.levels = this.snapshot_info.color_filter_settings.levels;
            this.color_filter.color_blend = this.snapshot_info.color_filter_settings.color_blend;
        }
    }

    /**
     * Initializes the collision body of this NPC.
     */
    config_body() {
        if (this.ignore_physics || (this.snapshot_info && !this.snapshot_info.body_in_map)) {
            return;
        }
        this.game.physics.p2.enable(this.sprite, false);
        //Important to be after the previous command
        if (this.data.dbs.npc_db[this.key_name].anchor_x !== undefined) {
            this.sprite.anchor.x = this.data.dbs.npc_db[this.key_name].anchor_x;
        } else {
            this.reset_anchor("x");
        }
        if (this.data.dbs.npc_db[this.key_name].anchor_y !== undefined) {
            this.sprite.anchor.y = this.data.dbs.npc_db[this.key_name].anchor_y;
        } else {
            this.reset_anchor("y");
        }
        this.sprite.body.clearShapes();
        this._body_radius = this.data.dbs.npc_db[this.key_name].body_radius;
        const width = this.body_radius << 1;
        const polygon = mount_collision_polygon(
            width,
            -(width >> 1),
            this.data.dbs.npc_db[this.key_name].collision_body_bevel
        );
        this.sprite.body.addPolygon(
            {
                optimalDecomp: false,
                skipSimpleCheck: true,
                removeCollinearPoints: false,
            },
            polygon
        );
        if (this.active) {
            this.sprite.body.setCollisionGroup(this.data.collision.npc_collision_groups[this.base_collision_layer]);
        }
        this.sprite.body.damping = 0;
        this.sprite.body.angularDamping = 0;
        this.sprite.body.inertia = 0;
        this.sprite.body.setZeroRotation();
        this.sprite.body.fixedRotation = true;
        this.sprite.body.mass = 1;
        this.sprite.body.static = true;
        this.sprite.body.collides(this.data.collision.hero_collision_group);
    }

    /**
     * Removes this NPC snapshot reference.
     */
    clear_snapshot() {
        this._snapshot_info = null;
    }

    /**
     * Unsets this NPC.
     */
    unset() {
        if (this.sprite) {
            this.data.middlelayer_group.removeChild(this.sprite);
            this.sprite.destroy();
        }
        if (this.shadow) {
            this.data.middlelayer_group.removeChild(this.shadow);
            this.shadow.destroy();
        }
        if (this.footsteps) {
            this.footsteps.destroy();
        }
        this.unset_push_timer();
        this._events.forEach(event => event.destroy());
        this.look_target = null;
        this.clear_snapshot();
    }
}
