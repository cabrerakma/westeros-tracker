/**
 * GM passcode. Deliberately simple and hard-coded (owner's decision): this is a game among friends.
 * It is checked in the browser only, so anyone who reads the page's JavaScript can find it; it just
 * stops casual edits. To change it, edit this file (and, later, the database function).
 */
export const GM_PASSCODE = "password234";

export const checkPasscode = (input: string | null): boolean => input !== null && input.trim() === GM_PASSCODE;
