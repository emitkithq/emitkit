const MARK = "data-inert-hidden";

const sync = () => {
  for (const element of document.body.children) {
    if (element.hasAttribute("inert")) {
      if (!element.hasAttribute("aria-hidden")) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute(MARK, "");
      }
    } else if (element.hasAttribute(MARK)) {
      element.removeAttribute("aria-hidden");
      element.removeAttribute(MARK);
    }
  }
};

/**
 * React Aria marks everything outside an open modal `inert`. Screen readers
 * honour that, but tooling that only reads `aria-hidden` (role-based test
 * queries among them) still sees the page behind the dialog, so the
 * header's "Create project" and the dialog's "Create project" collide.
 * Mirror one onto the other for the body's direct children.
 */
export const mirrorInertToAriaHidden = () => {
  new MutationObserver(sync).observe(document.body, {
    attributeFilter: ["inert"],
    attributes: true,
    childList: true,
    subtree: true,
  });
};
