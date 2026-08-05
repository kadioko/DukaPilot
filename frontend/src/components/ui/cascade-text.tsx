"use client";

import React, { useState, type CSSProperties, type ElementType } from "react";

export interface TextRevealProps {
  text: string;
  as?: ElementType;
  href?: string;
  target?: string;
  className?: string;
  style?: CSSProperties;
  fontSize?: string;
  staggerDelay?: number;
  duration?: number;
  easing?: string;
  color?: string;
  hoverColor?: string;
  direction?: "up" | "down";
  onClick?: (e: React.MouseEvent) => void;
}

const TextReveal = React.memo(function TextReveal({
  text,
  as: Component = "span",
  href,
  target,
  className = "",
  style,
  fontSize = "inherit",
  staggerDelay = 25,
  duration = 250,
  easing = "ease-in-out",
  color = "inherit",
  hoverColor = "#bbf7d0",
  direction = "up",
  onClick,
}: TextRevealProps) {
  const [hovered, setHovered] = useState(false);

  const sign = direction === "up" ? 1 : -1;
  const rootProps: Record<string, unknown> = {
    className: `inline-block relative no-underline cursor-pointer select-none ${className}`.trim(),
    style: {
      fontSize,
      color: hovered ? hoverColor : color,
      transition: "color 0.35s ease",
      lineHeight: 1,
      ...style,
    },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onClick,
    "aria-label": text,
  };

  if (Component === "a") {
    rootProps.href = href ?? "#";
    if (target) rootProps.target = target;
    if (target === "_blank") rootProps.rel = "noopener noreferrer";
  }

  return (
    <Component {...rootProps}>
      <span
        aria-hidden="true"
        className="inline-block will-change-transform"
        style={{
          transition: `transform ${duration}ms ${easing}`,
          transform: hovered ? `translateY(${-sign * 0.04}em)` : "translateY(0)",
        }}
      >
        {text}
      </span>
    </Component>
  );
});

TextReveal.displayName = "TextReveal";

export { TextReveal };
