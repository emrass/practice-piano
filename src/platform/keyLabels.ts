/**
 * How the Backspace key (KeyboardEvent.code 'Backspace') is printed on this keyboard: Apple
 * keyboards (Mac, iPad) label it "Delete".
 */
export function backspaceLabel(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  return /Macintosh|Mac OS X|iPad|iPhone|iPod/.test(ua) ? 'Delete' : 'Backspace';
}
