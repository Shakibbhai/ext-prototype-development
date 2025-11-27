import {
    BehaviorSubject,
    combineLatest,
    from,
    fromEvent,
    map,
    merge,
    mergeMap,
    Observable,
    of,
    Subject,
    Subscription,
    switchMap,
    withLatestFrom,
    zip,
  } from "rxjs";
  
  export type MaybePromise<T> = T | Promise<T>;
  export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
    {
      [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
    }[Keys];
  
  export type EventType = "default" | keyof HTMLElementEventMap;
  
  export type DOMEventTarget = Node | Window;
  
  function isWindow(obj: any) {
    return obj != null && typeof obj === "object" && "document" in obj && "location" in obj;
  }
  
  function isDomEventTarget(obj: any): obj is DOMEventTarget {
    return (
      obj &&
      typeof obj.addEventListener === "function" &&
      typeof obj.removeEventListener === "function" &&
      typeof obj.dispatchEvent === "function" &&
      ((obj && typeof obj.nodeType === "number") || isWindow(obj))
    );
  }
  
  type HandlerEvent<TEvent extends EventType> = TEvent extends keyof HTMLElementEventMap
    ? HTMLElementEventMap[TEvent]
    : Event;
  
  type TriggerUpdateFn = (element: DOMEventTarget, event?: Event) => MaybePromise<void>;
  
  type CustomHandler<TEvent extends EventType> = (
    ev: HandlerEvent<TEvent>,
    update: TriggerUpdateFn,
  ) => MaybePromise<void>;
  
  type ObserveArg<TEvent extends EventType> = (
    | DOMEventTarget
    | [DOMEventTarget, CustomHandler<TEvent>]
    | [DOMEventTarget, TEvent[], CustomHandler<TEvent>?]
  )[];
  
  interface DOMObserverDefaultProps<TMeta, TEvent extends EventType> {
    defaultMeta: TMeta;
    defaultEvents: TEvent[];
  }
  
  export interface TrackerNotification<TKey, TMeta> {
    trackerKey: TKey;
    meta: TMeta;
    documentId?: string;
  }
  
  export type CombinedNotifications<TKey, R extends Record<any, DefaultDOMObserver>> = {
    [K in TKey extends string ? TKey : never]: TrackerNotification<
      K,
      R[K] extends DOMObserver<infer M> ? M : never
    >;
  };
  
  export type DefaultDOMObserver = DOMObserver<any>;
  
  export abstract class DOMObserver<TMeta, TEvent extends EventType = EventType> {
    thresholdMet?: boolean;
    protected trackerKey?: string;
    protected state: WeakMap<DOMEventTarget, TMeta>;
    protected callbackFnMap: WeakMap<DOMEventTarget, (...args: any[]) => MaybePromise<any>>;
    protected defaultMeta?: TMeta;
    protected defaultEvents?: TEvent[];
  
    protected observationSubject = new Subject<TrackerNotification<string, TMeta>>();
    get observableObservations(): Observable<TrackerNotification<string, TMeta>> {
      return this.observationSubject.asObservable();
    }
  
    protected elementSubscriptions = new Map<DOMEventTarget, Subscription>();
  
    constructor(props?: DOMObserverDefaultProps<TMeta, TEvent>) {
      this.defaultMeta = props?.defaultMeta;
      this.defaultEvents = props?.defaultEvents;
      this.state = new Map();
      this.callbackFnMap = new Map();
    }
  
    setTrackerKey(key: string) {
      this.trackerKey = key as any;
    }
  
    observe<T extends TEvent>(...elements: ObserveArg<T>) {
      if (!(this.defaultMeta && this.defaultEvents)) throw "Missing default meta and events!";
      for (const elConfig of elements) {
        let el: DOMEventTarget;
        let eventNames: TEvent[] | undefined;
        let customHandler: CustomHandler<T> | undefined;
  
        if (isDomEventTarget(elConfig)) {
          el = elConfig;
          eventNames = this.defaultEvents;
        } else if (typeof elConfig[1] === "function") {
          el = elConfig[0];
          customHandler = elConfig[1];
          eventNames = this.defaultEvents;
        } else {
          el = elConfig[0];
          eventNames = elConfig[1] as TEvent[];
          customHandler = elConfig[2];
          if (!eventNames || eventNames.length === 0) eventNames = this.defaultEvents;
        }
  
        if (this.state.has(el)) continue;
  
        this.state.set(el, this.defaultMeta);
  
        const updateTrigger: TriggerUpdateFn = (elem, event) => this.update(elem, event);
        const handler = (event: Event) => {
          const specificEvent = event as HandlerEvent<T>;
          Promise.resolve(
            customHandler
              ? customHandler(specificEvent, updateTrigger)
              : updateTrigger(el, specificEvent),
          ).catch((error) => {
            console.error(`Error in event handler for ${event.type} on element`, el, error);
          });
        };
  
        const eventObservables = eventNames.map((eventName) => fromEvent(el, eventName as string));
  
        const mergedEventsObservable = merge(...eventObservables);
        const elementSubscription = mergedEventsObservable.subscribe({
          next: handler,
          error: (err) => {
            console.error(`Error in merged event stream for element`, el, err);
          },
          complete: () => {
            console.log(`Merged event stream for element`, el, "completed.");
          },
        });
  
        this.elementSubscriptions.set(el, elementSubscription);
      }
    }
  
    release(...elements: DOMEventTarget[]) {
      for (const el of elements) {
        this.state.delete(el);
        this.callbackFnMap.delete(el);
        const sub = this.elementSubscriptions.get(el);
        sub?.unsubscribe();
        this.elementSubscriptions.delete(el);
      }
  
      if (!elements.length) {
        this.elementSubscriptions.forEach((sub) => sub.unsubscribe());
        this.elementSubscriptions.clear();
        this.observationSubject.complete();
      }
    }
  
    abstract update(element: DOMEventTarget, event?: Event): MaybePromise<void>;
    abstract setCallback<Param>(
      element: DOMEventTarget,
      fn: (...args: Param[]) => MaybePromise<any>,
    ): void;
    abstract getMeta(element: DOMEventTarget): TMeta;
    abstract getAll(): WeakMap<DOMEventTarget, TMeta>;
  }
  