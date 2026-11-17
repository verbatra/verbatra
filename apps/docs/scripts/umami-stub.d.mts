import type { BrowserContext } from "playwright";

export interface StubbedUmamiRequest {
  readonly method: string;
  readonly pathname: string;
  readonly body: string | undefined;
}

export declare const STUB_TRACKER: string;

export declare const STUB_RECORDER: string;

export declare function stubUmami(context: BrowserContext): Promise<StubbedUmamiRequest[]>;
