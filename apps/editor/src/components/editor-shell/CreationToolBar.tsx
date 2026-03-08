import type { EntityType, LightType, PrimitiveShape } from "@web-hammer/shared";
import type { ComponentType, ReactNode } from "react";
import {
  AmbientLightIcon,
  ConePrimitiveIcon,
  CrateIcon,
  CubePrimitiveIcon,
  CylinderPrimitiveIcon,
  DirectionalLightIcon,
  HemisphereLightIcon,
  NpcSpawnIcon,
  PlayerSpawnIcon,
  PointLightIcon,
  SmartObjectIcon,
  SpherePrimitiveIcon,
  SpotLightIcon
} from "@/components/editor-shell/icons";
import { FloatingPanel } from "@/components/editor-shell/FloatingPanel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolId } from "@web-hammer/tool-system";

export function CreationToolBar({
  activeBrushShape,
  activeToolId,
  disabled = false,
  onPlaceEntity,
  onPlaceLight,
  onPlaceProp,
  onSelectBrushShape
}: {
  activeBrushShape: PrimitiveShape;
  activeToolId: ToolId;
  disabled?: boolean;
  onPlaceEntity: (type: EntityType) => void;
  onPlaceLight: (type: LightType) => void;
  onPlaceProp: (shape: PrimitiveShape) => void;
  onSelectBrushShape: (shape: PrimitiveShape) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <CreationGroup label="Brush">
        <CreationButton
          active={activeToolId === "brush" && activeBrushShape === "cube"}
          disabled={disabled}
          icon={CubePrimitiveIcon}
          label="Cube Brush"
          onClick={() => onSelectBrushShape("cube")}
        />
        <CreationButton
          active={activeToolId === "brush" && activeBrushShape === "sphere"}
          disabled={disabled}
          icon={SpherePrimitiveIcon}
          label="Sphere Brush"
          onClick={() => onSelectBrushShape("sphere")}
        />
        <CreationButton
          active={activeToolId === "brush" && activeBrushShape === "cylinder"}
          disabled={disabled}
          icon={CylinderPrimitiveIcon}
          label="Cylinder Brush"
          onClick={() => onSelectBrushShape("cylinder")}
        />
        <CreationButton
          active={activeToolId === "brush" && activeBrushShape === "cone"}
          disabled={disabled}
          icon={ConePrimitiveIcon}
          label="Cone Brush"
          onClick={() => onSelectBrushShape("cone")}
        />
      </CreationGroup>

      <CreationGroup label="Props">
        <CreationButton disabled={disabled} icon={CrateIcon} label="Crate Prop" onClick={() => onPlaceProp("cube")} />
        <CreationButton disabled={disabled} icon={CylinderPrimitiveIcon} label="Cylinder Prop" onClick={() => onPlaceProp("cylinder")} />
        <CreationButton disabled={disabled} icon={ConePrimitiveIcon} label="Cone Prop" onClick={() => onPlaceProp("cone")} />
        <CreationButton disabled={disabled} icon={SpherePrimitiveIcon} label="Sphere Prop" onClick={() => onPlaceProp("sphere")} />
      </CreationGroup>

      <CreationGroup label="Entities">
        <CreationButton disabled={disabled} icon={PlayerSpawnIcon} label="Player Spawn" onClick={() => onPlaceEntity("player-spawn")} />
        <CreationButton disabled={disabled} icon={NpcSpawnIcon} label="NPC Spawn" onClick={() => onPlaceEntity("npc-spawn")} />
        <CreationButton disabled={disabled} icon={SmartObjectIcon} label="Smart Object" onClick={() => onPlaceEntity("smart-object")} />
      </CreationGroup>

      <CreationGroup label="Lights">
        <CreationButton disabled={disabled} icon={PointLightIcon} label="Point Light" onClick={() => onPlaceLight("point")} />
        <CreationButton disabled={disabled} icon={DirectionalLightIcon} label="Directional Light" onClick={() => onPlaceLight("directional")} />
        <CreationButton disabled={disabled} icon={HemisphereLightIcon} label="Hemisphere Light" onClick={() => onPlaceLight("hemisphere")} />
        <CreationButton disabled={disabled} icon={SpotLightIcon} label="Spot Light" onClick={() => onPlaceLight("spot")} />
        <CreationButton disabled={disabled} icon={AmbientLightIcon} label="Ambient Light" onClick={() => onPlaceLight("ambient")} />
      </CreationGroup>
    </div>
  );
}

function CreationGroup({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="pl-2 text-[9px] font-medium tracking-[0.2em] text-foreground/34 uppercase">{label}</div>
      <FloatingPanel className="flex h-10 items-center gap-1 p-1.5">{children}</FloatingPanel>
    </div>
  );
}

function CreationButton({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(
              "size-7 rounded-xl text-foreground/58 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
              active && "bg-emerald-500/18 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
            )}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-[11px] font-medium text-foreground">{label}</div>
      </TooltipContent>
    </Tooltip>
  );
}
