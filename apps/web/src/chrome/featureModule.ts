import type { HttpHandler } from 'msw';
import type { HttpResponse } from 'msw';
import type { ReactElement } from 'react';

export type FeatureRoute = {
  readonly path: string;
  readonly element: ReactElement;
};

export type GraphqlRequestBody = {
  query?: string;
  variables?: Record<string, unknown>;
};

export type FeatureGraphqlHandler = (
  body: GraphqlRequestBody,
) => ReturnType<typeof HttpResponse.json>;

export type FeatureGraphql = Readonly<Record<string, FeatureGraphqlHandler>>;

export type FeatureHandlers = readonly HttpHandler[];

export type QueryKeyFactory = {
  readonly [key: string]:
    | readonly unknown[]
    | ((...args: never[]) => readonly unknown[]);
};

export type FeatureSlice = {
  readonly routes: readonly FeatureRoute[];
  readonly handlers: FeatureHandlers;
  readonly graphql: FeatureGraphql;
  readonly queryKeys: QueryKeyFactory;
  readonly endpoints?: Readonly<Record<string, unknown>>;
};

type SliceWithKeys = { readonly queryKeys: object };

export type MergedQueryKeys<S extends readonly SliceWithKeys[]> = S extends readonly [
  infer Head extends SliceWithKeys,
  ...infer Tail extends readonly SliceWithKeys[],
]
  ? Head['queryKeys'] & MergedQueryKeys<Tail>
  : unknown;

export function mergeQueryKeySlices<S extends readonly SliceWithKeys[]>(
  slices: S,
): MergedQueryKeys<S> {
  const merged: Record<string, unknown> = {};
  for (const slice of slices) {
    for (const [key, value] of Object.entries(slice.queryKeys)) {
      if (key in merged) {
        throw new Error(`Duplicate queryKeys export: ${key}`);
      }
      merged[key] = value;
    }
  }
  return merged as MergedQueryKeys<S>;
}

export function mergeEndpointSlices(
  slices: readonly FeatureSlice[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const slice of slices) {
    if (!slice.endpoints) continue;
    for (const [key, value] of Object.entries(slice.endpoints)) {
      if (key in merged) {
        throw new Error(`Duplicate endpoints export: ${key}`);
      }
      merged[key] = value;
    }
  }
  return merged;
}
