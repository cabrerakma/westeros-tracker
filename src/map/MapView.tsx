import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { REGIONS, TERRITORIES } from "../data";
import type { Faction, FactionId, Territory } from "../types";
import { controlState } from "../state/status";
import { regionSummary } from "../state/status";
import { LAKES, MOUNTAINS, REGION_PATHS, RIVERS, ROADS, SEA_LINKS, TERRITORY_PATHS, VIEWBOX } from "./geo";
import { CastleIcon } from "./CastleIcon";

export interface Layers {
  regionBorders: boolean;
  regionNames: boolean;
  regionCaptions: boolean;
  castleLabels: boolean;
  decor: boolean;
}

export interface MapHandle {
  fit(): void;
  zoomTo(id: string): void;
}

interface Props {
  holders: Record<string, FactionId>;
  factions: Faction[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  layers: Layers;
}

const REGION_TINT: Record<string, string> = {
  "beyond-the-wall": "#e4e8e6",
  "the-wall": "#bcc6cc",
  "the-north": "#cfd3c6",
  "the-vale": "#d9d0bd",
  "the-riverlands": "#d6cfa9",
  "the-westerlands": "#dcc3a0",
  "the-iron-islands": "#c4c9c0",
  "the-crownlands": "#dbc2b0",
  "the-reach": "#cfdab0",
  "the-stormlands": "#d9d6a8",
  dorne: "#e3c99a",
  "the-free-cities": "#d6cfdc",
};

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
function tintFor(t: Territory, index: number): string {
  // A little variation inside a region so neighbours read as separate shapes.
  return lighten(REGION_TINT[t.region] ?? "#ddd", [0, 0.1, 0.04, 0.14, 0.07][index % 5]);
}

interface ShapeProps {
  id: string;
  d: string;
  fill: string;
  label: string;
  selected: boolean;
  hovered: boolean;
  onSelect(id: string): void;
  onHover(id: string | null, e?: React.MouseEvent): void;
}

const TerritoryShape = memo(function TerritoryShape({ id, d, fill, label, selected, hovered, onSelect, onHover }: ShapeProps) {
  return (
    <path
      d={d}
      fill={fill}
      className={"terr" + (hovered ? " hovered" : "") + (selected ? " selected" : "")}
      vectorEffect="non-scaling-stroke"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      onMouseEnter={(e) => onHover(id, e)}
      onMouseMove={(e) => onHover(id, e)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    />
  );
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const MapView = forwardRef<MapHandle, Props>(function MapView({ holders, factions, selectedId, onSelect, layers }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [k, setK] = useState(1);
  const [u, setU] = useState(0.4); // screen pixels per map unit at k = 1
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const svg = svgRef.current!;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 14])
      .translateExtent([[-250, -150], [VIEWBOX[2] + 250, VIEWBOX[3] + 150]])
      .clickDistance(4)
      .on("zoom", (e) => {
        gRef.current?.setAttribute("transform", e.transform.toString());
        setK(Math.round(e.transform.k * 100) / 100);
      });
    zoomRef.current = z;
    select(svg).call(z).on("dblclick.zoom", null);
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0) setU(Math.min(r.width / VIEWBOX[2], r.height / VIEWBOX[3]));
    });
    ro.observe(svg);
    return () => {
      ro.disconnect();
      select(svg).on(".zoom", null);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    fit() {
      if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(450).call(zoomRef.current.transform, zoomIdentity);
    },
    zoomTo(id: string) {
      const t = TERRITORIES.find((x) => x.id === id);
      if (!t || !svgRef.current || !zoomRef.current) return;
      const scale = 4;
      select(svgRef.current)
        .transition()
        .duration(450)
        .call(zoomRef.current.transform, zoomIdentity.translate(VIEWBOX[2] / 2 - scale * t.seat[0], VIEWBOX[3] / 2 - scale * t.seat[1]).scale(scale));
    },
  }));

  const factionById = useMemo(() => Object.fromEntries(factions.map((f) => [f.id, f])), [factions]);

  const onHover = useCallback((id: string | null, e?: React.MouseEvent) => {
    setHoverId(id);
    if (e && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  }, []);
  const onSelectCb = useCallback((id: string) => onSelect(id), [onSelect]);

  // Per-territory tint by index within its region (stable).
  const fills = useMemo(() => {
    const idx: Record<string, number> = {};
    const out: Record<string, string> = {};
    for (const t of TERRITORIES) {
      idx[t.region] = (idx[t.region] ?? -1) + 1;
      out[t.id] = tintFor(t, idx[t.region]);
    }
    return out;
  }, []);

  const iconScale = 1 / Math.pow(k, 0.55);
  const labelPx = 12.5; // castle label size in screen pixels
  const labelSize = labelPx / (u * k);
  const regionFade = clamp01((3.4 - k) / 1.4);
  const captionFade = clamp01((5 - k) / 1.5);
  const hovered = hoverId ? TERRITORIES.find((t) => t.id === hoverId) : undefined;
  const hoveredHolder = hovered ? factionById[holders[hovered.id]] : undefined;

  const showLabel = (t: Territory) => {
    if (t.id === selectedId || t.id === hoverId) return true;
    if (!layers.castleLabels) return false;
    return t.tier === "city" || t.tier === "fortress" ? k >= 1.6 : k >= 2.4;
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg ref={svgRef} className="map-svg" viewBox={`0 0 ${VIEWBOX[2]} ${VIEWBOX[3]}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Map of Westeros" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        <defs>
          <radialGradient id="ocean" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#b9c9d0" />
            <stop offset="100%" stopColor="#9fb2bb" />
          </radialGradient>
        </defs>
        <rect x={-2000} y={-2000} width={5000} height={6000} fill="url(#ocean)" onClick={() => onSelect(null)} />
        <g ref={gRef}>
          {/* coastal shallows, drawn under the land */}
          <g className="shallows" pointerEvents="none">
            {Object.values(REGION_PATHS).map((d, i) => (
              <path key={i} d={d} fill="#c3d2d8" stroke="#c3d2d8" strokeWidth={22} strokeLinejoin="round" />
            ))}
          </g>

          {/* sea links for islands */}
          <g pointerEvents="none">
            {SEA_LINKS.map(([a, b]) => {
              const ta = TERRITORIES.find((t) => t.id === a)!;
              const tb = TERRITORIES.find((t) => t.id === b)!;
              return <line key={a + b} x1={ta.seat[0]} y1={ta.seat[1]} x2={tb.seat[0]} y2={tb.seat[1]} className="sea-link" vectorEffect="non-scaling-stroke" />;
            })}
          </g>

          {/* territories */}
          <g>
            {TERRITORIES.map((t) => (
              <TerritoryShape
                key={t.id}
                id={t.id}
                d={TERRITORY_PATHS[t.id]}
                fill={fills[t.id]}
                label={`${t.name}, ${t.seatHouse}, ${REGIONS.find((r) => r.id === t.region)?.name}. Held by ${factionById[holders[t.id]]?.name ?? holders[t.id]}`}
                selected={t.id === selectedId}
                hovered={t.id === hoverId}
                onSelect={onSelectCb}
                onHover={onHover}
              />
            ))}
          </g>

          {layers.decor && (
            <g pointerEvents="none" className="decor">
              {LAKES.map((d, i) => (
                <path key={"l" + i} d={d} className="lake" vectorEffect="non-scaling-stroke" />
              ))}
              {RIVERS.map((r, i) => (
                <path key={"r" + i} d={r.d} className={r.size >= 2 ? "river big" : "river"} vectorEffect="non-scaling-stroke" />
              ))}
              {ROADS.map((r, i) => (
                <path key={"d" + i} d={r.d} className="road" vectorEffect="non-scaling-stroke" />
              ))}
              {MOUNTAINS.map(([x, y], i) => (
                <path key={"m" + i} d={`M${x - 4.5} ${y + 3}L${x - 1} ${y - 3.5}L${x + 1} ${y - 1}L${x + 2.5} ${y - 3}L${x + 5} ${y + 3}Z`} className="mountain" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}

          {/* region borders (thicker than territory borders) */}
          {layers.regionBorders && (
            <g pointerEvents="none">
              {Object.entries(REGION_PATHS).map(([id, d]) => (
                <path key={id} d={d} className="region-border" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}

          {/* selection / hover outline, on top of borders */}
          {(selectedId || hoverId) && (
            <g pointerEvents="none">
              {hoverId && hoverId !== selectedId && <path d={TERRITORY_PATHS[hoverId]} className="outline hover" vectorEffect="non-scaling-stroke" />}
              {selectedId && <path d={TERRITORY_PATHS[selectedId]} className="outline select" vectorEffect="non-scaling-stroke" />}
            </g>
          )}

          {/* region names and captions */}
          <g pointerEvents="none" className="region-labels">
            {REGIONS.map((r) => {
              const size = r.labelSize ?? 32;
              const [x, y] = r.labelPos;
              const rot = r.labelRotate ? `rotate(${r.labelRotate} ${x} ${y})` : undefined;
              const name = r.name.replace(/^The /, "").toUpperCase();
              return (
                <g key={r.id} transform={rot}>
                  {layers.regionNames && regionFade > 0 && (
                    <text x={x} y={y} textAnchor="middle" className="region-name" fontSize={size} letterSpacing={size * 0.22} opacity={regionFade * 0.7}>
                      {name}
                    </text>
                  )}
                  {layers.regionCaptions && captionFade > 0 && (
                    <text x={x} y={y + Math.max(14, size * 0.55)} textAnchor="middle" className="region-caption" fontSize={Math.max(11, size * 0.4)} opacity={captionFade}>
                      {regionSummary(r, TERRITORIES, holders, factions)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* castles */}
          <g pointerEvents="none">
            {TERRITORIES.map((t) => (
              <g key={t.id} transform={`translate(${t.seat[0]} ${t.seat[1]}) scale(${iconScale})`}>
                <CastleIcon tier={t.tier} />
              </g>
            ))}
          </g>

          {/* castle names */}
          <g pointerEvents="none" className="castle-labels">
            {TERRITORIES.filter(showLabel).map((t) => (
              <text
                key={t.id}
                x={t.seat[0]}
                y={t.seat[1] + (t.tier === "city" ? 11 : 9) * iconScale + labelSize * 0.9}
                textAnchor="middle"
                fontSize={labelSize}
                strokeWidth={labelSize * 0.28}
                className="castle-label"
              >
                {t.name}
              </text>
            ))}
          </g>
        </g>
      </svg>

      {hovered && (
        <div className="tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="tooltip">
          <strong>{hovered.name}</strong>
          <div>{hovered.seatHouse}</div>
          <div>{REGIONS.find((r) => r.id === hovered.region)?.name}</div>
          <div>
            Held by <b>{hoveredHolder?.name ?? holders[hovered.id]}</b>
          </div>
          <div className="muted">{controlState(holders[hovered.id], hovered.homeFaction)}</div>
        </div>
      )}
    </div>
  );
});
