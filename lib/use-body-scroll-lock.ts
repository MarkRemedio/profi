"use client";

import { useEffect } from "react";

/**
 * Freeze the page behind an open overlay.
 *
 * `overflow: hidden` on <body> alone is not enough: iOS Safari ignores it for
 * touch scrolling, which is exactly the case this exists for — a mobile drawer
 * where the page underneath still slides around. Pinning the body with
 * `position: fixed` does hold on iOS, but it also collapses the scroll offset
 * to zero, so the previous offset is stashed and restored on release.
 *
 * Every property is captured before being overwritten rather than reset to "",
 * so a lock nested inside another overlay hands back what it found.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      // Pinning the body scrolled the document to the top; put it back.
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
