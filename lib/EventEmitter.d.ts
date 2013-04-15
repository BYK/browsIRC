declare module 'EventEmitter' {
    export class EventEmitter {
        addListener(event:string, listener:Function);
        on(event:string, listener:Function);
        once(event:string, listener:Function): void;
        removeListener(event:string, listener:Function): void;
        removeAllListeners(event:string): void;
        setMaxListeners(n:number): void;
        listeners(event:string): { Function; }[];
        emit(event:string, ...args:any[]): void;
    }
}
