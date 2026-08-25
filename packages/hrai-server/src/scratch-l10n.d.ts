/**
 * scratch-l10n ships no type declarations. Only the block message catalogue is used
 * here, and its shape is stable: locale -> message key -> label template.
 */
declare module "scratch-l10n/locales/blocks-msgs.js" {
    const messages: Record<string, Record<string, string>>;
    export default messages;
}
