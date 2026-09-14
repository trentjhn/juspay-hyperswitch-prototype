// @juspay-tech/react-hyper-js ships no type definitions. These cover the
// three exports this app uses, typed against the declarations bundled with
// @juspay-tech/hyper-js. Component props were checked against
// react-hyper-js/dist/bundle.js (2.9.0).
declare module "@juspay-tech/react-hyper-js" {
  import type { ReactElement, ReactNode } from "react";
  import type { ElementsOptions, HyperInstance } from "@juspay-tech/hyper-js";

  export function HyperElements(props: {
    hyper: Promise<HyperInstance>;
    options: ElementsOptions;
    children?: ReactNode;
  }): ReactElement;

  export function UnifiedCheckout(props: {
    id?: string;
    options?: Record<string, unknown>;
    onReady?: (event?: unknown) => void;
    onChange?: (event?: unknown) => void;
  }): ReactElement;

  export function useHyper(): HyperInstance;
}
