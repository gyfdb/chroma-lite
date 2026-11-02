import { createUniqueId, JSX, Match, Switch } from "solid-js";
import { EffectType } from "../api";

/** A small illustrated icon for each effect type (24×24 viewBox). */
export default function EffectIcon(props: { type: EffectType; size?: number }) {
  const id = createUniqueId();
  const size = () => props.size ?? 22;

  const Svg = (p: { children: JSX.Element }) => (
    <svg width={size()} height={size()} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {p.children}
    </svg>
  );

  return (
    <Switch>
      <Match when={props.type === "fire"}>
        <Svg>
          <defs>
            <linearGradient id={`f${id}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stop-color="#ff3d00" />
              <stop offset="0.6" stop-color="#ff8a00" />
              <stop offset="1" stop-color="#ffd36b" />
            </linearGradient>
          </defs>
          <path
            d="M12 2.5c.6 3-1.6 4.6-2.9 6.4C7.8 10.6 7 12.2 7 14.2A5 5 0 0 0 12 21.5a5 5 0 0 0 5-5.3c0-2.4-1.3-3.6-2-5.4-.3 1.3-1 2.2-1.9 2.6.4-3.5-.4-7-1.1-10.9Z"
            fill={`url(#f${id})`}
          />
          <path d="M12 21.5a2.7 2.7 0 0 1-2.7-2.8c0-1.8 1.5-2.6 2.2-4.4.9 1.6 3.2 2.5 3.2 4.6a2.7 2.7 0 0 1-2.7 2.6Z" fill="#ffe7a3" />
        </Svg>
      </Match>

      <Match when={props.type === "solid"}>
        <Svg>
          <rect x="4" y="4" width="16" height="16" rx="4" fill="#ff6a1a" />
          <rect x="4.75" y="4.75" width="14.5" height="14.5" rx="3.3" stroke="#ffffff40" stroke-width="1.5" />
        </Svg>
      </Match>

      <Match when={props.type === "breathing"}>
        <Svg>
          <circle cx="12" cy="12" r="9.5" fill="#00a0ff" fill-opacity="0.15" />
          <circle cx="12" cy="12" r="6.5" fill="#00a0ff" fill-opacity="0.35" />
          <circle cx="12" cy="12" r="3.5" fill="#4cc3ff" />
        </Svg>
      </Match>

      <Match when={props.type === "spectrum"}>
        <Svg>
          {["#ff3b3b", "#ffb000", "#e8ff3b", "#3bff7a", "#3bc4ff", "#a03bff"].map((c, i) => {
            const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
            const p = (a: number, r: number) => `${12 + Math.cos(a) * r} ${12 + Math.sin(a) * r}`;
            return <path d={`M12 12 L${p(a0, 9.5)} A9.5 9.5 0 0 1 ${p(a1, 9.5)} Z`} fill={c} />;
          })}
          <circle cx="12" cy="12" r="4" fill="#17171d" />
        </Svg>
      </Match>

      <Match when={props.type === "wave"}>
        <Svg>
          <defs>
            <linearGradient id={`w${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ff3b6b" />
              <stop offset="0.35" stop-color="#ffc23b" />
              <stop offset="0.65" stop-color="#3bff9a" />
              <stop offset="1" stop-color="#3b8cff" />
            </linearGradient>
          </defs>
          <path
            d="M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-4 5-2"
            stroke={`url(#w${id})`}
            stroke-width="2.6"
            stroke-linecap="round"
          />
          <path
            d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.5 5-1.2"
            stroke={`url(#w${id})`}
            stroke-width="1.6"
            stroke-linecap="round"
            opacity="0.5"
          />
        </Svg>
      </Match>

      <Match when={props.type === "starlight"}>
        <Svg>
          <path d="M9 3l1.4 4.1L14.5 8.5l-4.1 1.4L9 14l-1.4-4.1L3.5 8.5l4.1-1.4L9 3Z" fill="#ffffff" />
          <path d="M17 12l.9 2.6 2.6.9-2.6.9L17 19l-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" fill="#cfe3ff" />
          <circle cx="18.5" cy="5.5" r="1.2" fill="#ffffffaa" />
          <circle cx="6" cy="18" r="1" fill="#ffffff88" />
        </Svg>
      </Match>

      <Match when={props.type === "reactive"}>
        <Svg>
          <rect x="6" y="9" width="12" height="11" rx="2.5" fill="#2a2a33" stroke="#ffdc8c" stroke-width="1.5" />
          <rect x="8.5" y="11.5" width="7" height="5" rx="1.2" fill="#ffdc8c" />
          <path d="M12 2.5v3M5.5 5l1.8 2.2M18.5 5l-1.8 2.2" stroke="#ffdc8c" stroke-width="1.6" stroke-linecap="round" />
        </Svg>
      </Match>

      <Match when={props.type === "ripple"}>
        <Svg>
          <circle cx="12" cy="12" r="2.4" fill="#78c8ff" />
          <circle cx="12" cy="12" r="6" stroke="#78c8ff" stroke-width="1.6" opacity="0.75" />
          <circle cx="12" cy="12" r="9.6" stroke="#78c8ff" stroke-width="1.2" opacity="0.35" />
        </Svg>
      </Match>
    </Switch>
  );
}
