import type { SVGProps } from "react";

export default function IconParkOutlineMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24px"
      height="24px"
      viewBox="0 0 48 48"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <path strokeLinecap="round" d="M11 6v36"></path>
        <path d="M11 9h14l7 3h7a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2h-7l-7-3H11z"></path>
        <path strokeLinecap="round" d="M7 42h8"></path>
      </g>
    </svg>
  );
}
