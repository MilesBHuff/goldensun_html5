import {ControllableChar} from "../ControllableChar";
import {GameEvent, event_types} from "./GameEvent";

export class LookEvent extends GameEvent {
    private look: boolean;
    private looker: number | string;
    private target: number | string;

    constructor(game, data, active, key_name, look, looker, target) {
        super(game, data, event_types.LOOK, active, key_name);
        this.look = look;
        this.looker = looker;
        this.target = target;
    }

    _fire() {
        if (!this.active) return;
        const looker: ControllableChar = this.looker === "hero" ? this.data.hero : this.data.map.npcs[this.looker];
        const target: ControllableChar = this.target === "hero" ? this.data.hero : this.data.map.npcs[this.target];
        looker.set_look_to_target(this.look, target);
    }

    destroy() {
        this.origin_npc = null;
        this.active = false;
    }
}
