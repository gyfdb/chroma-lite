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

      <Match when={props.type === "aurora"}>
        <Svg>
          <defs>
            <linearGradient id={`a${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#00ff8c" />
              <stop offset="0.5" stop-color="#00aaff" />
              <stop offset="1" stop-color="#aa3cff" />
            </linearGradient>
            <linearGradient id={`af${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
              <stop offset="1" stop-color="#fff" stop-opacity="0" />
            </linearGradient>
            <mask id={`am${id}`}>
              <rect width="24" height="24" fill={`url(#af${id})`} />
            </mask>
          </defs>
          <path
            d="M2 6c3 2 5-2 8 0s5 3 7 1 4-2 5-1v13H2Z"
            fill={`url(#a${id})`}
            mask={`url(#am${id})`}
          />
          <path d="M2 6c3 2 5-2 8 0s5 3 7 1 4-2 5-1" stroke={`url(#a${id})`} stroke-width="1.8" stroke-linecap="round" />
        </Svg>
      </Match>

      <Match when={props.type === "rain"}>
        <Svg>
          {[
            [6, 3, 1],
            [12, 6, 0.75],
            [18, 2, 0.9],
            [9, 11, 0.6],
            [16, 12, 0.8],
          ].map(([x, y, o]) => (
            <path d={`M${x} ${y}v4.5`} stroke="#78b4ff" stroke-width="1.8" stroke-linecap="round" opacity={o} />
          ))}
          <path d="M5 20.5h14" stroke="#78b4ff" stroke-width="1.6" stroke-linecap="round" opacity="0.5" />
          <path d="M10 18.5l-1.5-1.5M14 18.5l1.5-1.5" stroke="#b4d4ff" stroke-width="1.3" stroke-linecap="round" />
        </Svg>
      </Match>

      <Match when={props.type === "lava"}>
        <Svg>
          <path d="M8.5 2.5h7l1.5 4.5v10.5a5 5 0 0 1-10 0V7Z" fill="#2a0a2e" stroke="#7a2a5a" stroke-width="1.2" />
          <circle cx="12" cy="17" r="3.2" fill="#ff5a00" />
          <circle cx="10.6" cy="11" r="2" fill="#ffb43c" />
          <ellipse cx="13.6" cy="7.5" rx="1.4" ry="1.7" fill="#ff8a1e" />
        </Svg>
      </Match>

      <Match when={props.type === "candle"}>
        <Svg>
          <defs>
            <radialGradient id={`c${id}`} cx="0.5" cy="0.55" r="0.5">
              <stop offset="0" stop-color="#ffd27a" stop-opacity="0.7" />
              <stop offset="1" stop-color="#ff9329" stop-opacity="0" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="8" r="7" fill={`url(#c${id})`} />
          <path d="M12 3c1.6 2.2 2.4 3.6 2.4 5a2.4 2.4 0 0 1-4.8 0c0-1.4.8-2.8 2.4-5Z" fill="#ffb347" />
          <path d="M12 6.3c.6.9 1 1.5 1 2.1a1 1 0 0 1-2 0c0-.6.4-1.2 1-2.1Z" fill="#fff1c4" />
          <rect x="8.5" y="12" width="7" height="9.5" rx="1.4" fill="#fff4e0" />
          <path d="M12 10.6v1.4" stroke="#5a4135" stroke-width="1.2" stroke-linecap="round" />
        </Svg>
      </Match>

      <Match when={props.type === "lightning"}>
        <Svg>
          <path d="M5 9a4.5 4.5 0 0 1 8.6-1.7A3.5 3.5 0 1 1 17 13H6.5A3.5 3.5 0 0 1 5 9Z" fill="#3a4a8a" />
          <path d="M12.5 12l-3 5h3l-1.5 5 5-7h-3l1.5-3Z" fill="#dce8ff" />
        </Svg>
      </Match>

      <Match when={props.type === "timeOfDay"}>
        <Svg>
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="#20305a" />
          <path d="M12 3a9 9 0 0 0 0 18Z" fill="#ffd36b" />
          <circle cx="8.2" cy="12" r="2.8" fill="#fff4dc" />
          <path d="M16.6 9.2a3 3 0 1 0 0 5.6 3.4 3.4 0 0 1 0-5.6Z" fill="#ffb066" />
          <circle cx="12" cy="12" r="9" stroke="#ffffff30" stroke-width="1.2" />
        </Svg>
      </Match>

      <Match when={props.type === "comet"}>
        <Svg>
          <defs>
            <linearGradient id={`k${id}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="#78c8ff" stop-opacity="0" />
              <stop offset="1" stop-color="#78c8ff" />
            </linearGradient>
          </defs>
          <path d="M3 20.5L16.5 7" stroke={`url(#k${id})`} stroke-width="3.2" stroke-linecap="round" />
          <path d="M6 21.5l8-8" stroke={`url(#k${id})`} stroke-width="1.6" stroke-linecap="round" opacity="0.6" />
          <circle cx="17.5" cy="6.5" r="3.2" fill="#d6efff" />
        </Svg>
      </Match>

      <Match when={props.type === "shockwave"}>
        <Svg>
          <path d="M2.5 12h19M12 2.5v19" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.35" />
          <path d="M6 12h3M15 12h3M12 6v3M12 15v3" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" />
          <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1.2" fill="#ffffff" />
        </Svg>
      </Match>

      <Match when={props.type === "fireworks"}>
        <Svg>
          {["#ff5a5a", "#ffc83c", "#5aff96", "#3cb4ff", "#c85aff", "#ff5ac8", "#ffffff", "#ffa03c"].map((c, i) => {
            const a = (i / 8) * Math.PI * 2;
            const p = (r: number) => `${10 + Math.cos(a) * r} ${9 + Math.sin(a) * r}`;
            return <path d={`M${p(2.6)} L${p(6.4)}`} stroke={c} stroke-width="1.8" stroke-linecap="round" />;
          })}
          <circle cx="10" cy="9" r="1.4" fill="#fff6d2" />
          <path d="M16 21.5l-2.5-5" stroke="#ffc83c" stroke-width="1.4" stroke-linecap="round" opacity="0.6" />
        </Svg>
      </Match>

      <Match when={props.type === "frost"}>
        <Svg>
          <g stroke="#aadcff" stroke-width="1.7" stroke-linecap="round">
            <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" />
            <path d="M9.6 4.2L12 6.4l2.4-2.2M9.6 19.8L12 17.6l2.4 2.2" />
            <path d="M4.4 10.4l2.9-.7-.9-2.9M19.6 13.6l-2.9.7.9 2.9M4.4 13.6l2.9.7-.9 2.9M19.6 10.4l-2.9-.7.9-2.9" />
          </g>
        </Svg>
      </Match>

      <Match when={props.type === "clickCharge"}>
        <Svg>
          <rect x="6.5" y="3" width="11" height="18" rx="5.5" fill="#2a2a33" stroke="#ff7828" stroke-width="1.4" />
          <path d="M12 3v6.5" stroke="#ff7828" stroke-width="1.4" />
          <path d="M6.5 8.5a5.5 5.5 0 0 1 5.5-5.5v6.5H6.5Z" fill="#ff7828" />
          <path d="M12.8 11.5l-2.4 4h2l-.6 3.2 2.6-4.2h-2Z" fill="#ffb07a" />
        </Svg>
      </Match>
    </Switch>
  );
}
