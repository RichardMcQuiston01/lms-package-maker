/** Data the player script reads from `#lpm-config`. */
export interface PlayerConfig {
  readonly title: string;
  readonly pages: readonly { readonly id: string; readonly title: string }[];
}
