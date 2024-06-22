import { MovementType } from "../common/constants";
import { SectorCoordinates } from "../common/types";
import { cargoV2 } from "../scripts/cargoV2";
import { ResourceName } from "../src/SageGame";
import { SagePlayer } from "../src/SagePlayer";
import { setCycles } from "../utils/inputs/setCycles";
import { setFleetV2 } from "../utils/inputsV2/setFleet";
import { setMovementTypeV2 } from "../utils/inputsV2/setMovementType";
import { setResourcesAmountV2 } from "../utils/inputsV2/setResourcesAmount";
import { setStarbaseV2 } from "../utils/inputsV2/setStarbase";

export const startCargo = async (player: SagePlayer) => {
  // 1. set cycles
  const cycles = await setCycles();

  // 2. set fleet
  const fleet = await setFleetV2(player);
  if (fleet.type !== "Success") return fleet;

  const fleetCurrentSector = fleet.data.getCurrentSector();
  if (!fleetCurrentSector) return { type: "FleetCurrentSectorError" as const };

  // 3. set cargo sector
  const starbase = await setStarbaseV2(fleet.data, true, "Choose the starbase destination:");
  if (starbase.type !== "Success") return starbase;

  const sector = player.getSageGame().getSectorByCoords(starbase.data.data.sector as SectorCoordinates);
  if (sector.type !== "Success") return sector;

  // 4. set cargo resource allocation
  console.log(`Available resource names: ${Object.keys(ResourceName).join(", ")}`);

  const resourcesGo = await setResourcesAmountV2(
    "Enter resources to freight in starbase DESTINATION (e.g., Carbon 5000), or press enter to skip:"
  );
  const resourcesBack = await setResourcesAmountV2(
    "Enter resources to freight in CURRENT starbase (ex: Hydrogen 2000). Press enter to skip:"
  );

  // 5. set fleet movement type (->)
  const movementGo = await setMovementTypeV2("(->)")

  const [goRoute, goFuelNeeded] = fleet.data.calculateRouteToSector(
    fleetCurrentSector.coordinates as SectorCoordinates, 
    sector.data.data.coordinates as SectorCoordinates,
    movementGo?.movement,
  );
  
  // 6. set fleet movement type (<-) 
  const movementBack = await setMovementTypeV2("(<-)")

  const [backRoute, backFuelNeeded] = fleet.data.calculateRouteToSector(
    sector.data.data.coordinates as SectorCoordinates, 
    fleetCurrentSector.coordinates as SectorCoordinates,
    movementBack?.movement,
  );
  
  const fuelNeeded = (goFuelNeeded + Math.round(goFuelNeeded * 0.1)) + (backFuelNeeded + Math.round(backFuelNeeded * 0.1));
  console.log("Fuel needed:", fuelNeeded);

  // 7. start cargo loop
  for (let i = 0; i < cycles; i++) {
    const cargo = await cargoV2(
      fleet.data,
      fuelNeeded,
      resourcesGo,
      movementGo.movement,
      goRoute,
      goFuelNeeded,
      resourcesBack,
      movementBack.movement,
      backRoute,
      backFuelNeeded,
    )
    if (cargo.type !== "Success") {
      return cargo;
    }
  }

  return { type: "Success" } as const;
}