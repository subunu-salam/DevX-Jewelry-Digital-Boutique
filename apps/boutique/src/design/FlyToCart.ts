/**
 * Fly-to-cart: clones the product image, flies it in an arc into the Bag tab,
 * then asks the tab bar to "catch" it with a small bounce.
 * Uses the Web Animations API, so it runs on the compositor (smooth on phones).
 */
export const CART_BUMP_EVENT = "aurelia:cart-bump";

export function flyToCart(source: Element | null, imageSrc?: string | null) {
  const target = document.querySelector("[data-cart-target]");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const bump = () => window.dispatchEvent(new CustomEvent(CART_BUMP_EVENT));
  if (!source || !target || !imageSrc || reduced) { bump(); return; }

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 220);

  const el = document.createElement("img");
  el.src = imageSrc;
  el.alt = "";
  Object.assign(el.style, {
    position: "fixed",
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "cover",
    borderRadius: "18px",
    zIndex: "200",
    pointerEvents: "none",
    boxShadow: "0 20px 40px -18px rgba(0,0,0,.55)",
    border: "1px solid rgba(196,163,106,.6)",
    willChange: "transform, opacity",
  } as CSSStyleDeclaration);
  document.body.appendChild(el);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = 22 / size; // shrink to icon size

  const anim = el.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1, borderRadius: "18px" },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 90}px) scale(0.55) rotate(-6deg)`, opacity: 1, borderRadius: "40%", offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(0deg)`, opacity: 0.35, borderRadius: "50%" },
    ],
    { duration: 850, easing: "cubic-bezier(0.55, 0, 0.35, 1)", fill: "forwards" },
  );
  anim.onfinish = () => { el.remove(); bump(); };
  anim.oncancel = () => el.remove();
}
