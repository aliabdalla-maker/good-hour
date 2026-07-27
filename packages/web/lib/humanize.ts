/** "blackout_blinds" -> "Blackout blinds" -- amenity/category tags are stored snake_case for matching, not display. */
export function humanizeTag(tag: string): string {
  const words = tag.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
