export const PRINTF_POSITION = "(?:\\d+\\$)?";

export const PRINTF_FLAGS_WIDTH_PRECISION = "[-+0#]*(?:[1-9]\\d*)?(?:\\.\\d+)?";

export const PRINTF_LENGTH = "(?:hh|h|ll|l|q|z|j|t|L)?";

export const PRINTF_ANY_CONVERSION = "[A-Za-z@]";

export const PRINTF_CONVERSION = "[sSdiufFxXocCbBeEgG@]";
