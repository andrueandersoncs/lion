// What the pages of lionlang.dev decide without touching a page. It is kept
// apart from the scripts that read and change the page so that the tests of
// packages/site-runtime can check it for any page.

/**
 * How long a program ran, as an example shows it. A program that did not
 * run, such as one that is not JSON, has no time and shows none.
 *
 * @param {number | undefined} ms
 */
export const timeLabel = (ms) => {
  if (ms === undefined) {
    return "";
  }
  if (ms < 1) {
    return "<1 ms";
  }
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
};

/**
 * Which section of a document is being read: its place among the sections
 * that "On this page" lists, or -1 above the first.
 *
 * A link to a section scrolls its heading to the page's scroll padding and
 * the heading's scroll margin below the top of the window, so a section is
 * reached once its heading is that high. Three rules follow:
 *
 * - The section being read is the last one reached.
 * - At the end of a page, that is the last section, whose heading may never
 *   get that high.
 * - A section a link was followed to is the one being read for as long as
 *   the page stays where the link left it, however high its heading got.
 *
 * @param {object} page
 * @param {readonly number[]} page.tops How far each section's heading is below the top of the window.
 * @param {readonly number[]} page.margins Each heading's scroll-margin-top.
 * @param {number} page.padding The page's scroll-padding-top.
 * @param {number} page.scrolled How far the page is scrolled.
 * @param {number} page.end How far the page can scroll.
 * @param {number} page.named The section the URL's fragment names, or -1.
 * @param {number} page.leftAt How far the page was scrolled when the URL's fragment was last followed.
 */
export const sectionBeingRead = ({
  tops,
  margins,
  padding,
  scrolled,
  end,
  named,
  leftAt,
}) => {
  if (named >= 0 && scrolled === leftAt) {
    return named;
  }
  if (scrolled > 0 && scrolled >= end - 1) {
    return tops.length - 1;
  }
  // A pixel of slack, since a browser scrolls to a whole or part pixel.
  return tops.findLastIndex((top, at) => top <= padding + margins[at] + 1);
};
