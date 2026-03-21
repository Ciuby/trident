export class Emitter {
    listeners = new Set();
    emit(payload) {
        for (const listener of this.listeners) {
            listener(payload);
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
