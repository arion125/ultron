import { SectorCoordinates } from "../common/types";
import { comboV2 } from "../scripts/comboV2";
import { miningV2 } from "../scripts/miningV2";
import { ResourceName } from "../src/SageGame";
import { SagePlayer } from "../src/SagePlayer";
import { setCycles } from "../utils/inputs/setCycles";
import { setFleetV2 } from "../utils/inputsV2/setFleet";
import { setMovementTypeV2 } from "../utils/inputsV2/setMovementType";
import { setResourceToMine } from "../utils/inputsV2/setResourceToMine";
import { setResourcesAmountV2 } from "../utils/inputsV2/setResourcesAmount";
import { setStarbaseV2 } from "../utils/inputsV2/setStarbase";

export const startCombo = async (player: SagePlayer) => {
  // 1. set cycles
  const cycles = await setCycles();

  // 2. set fleet
  const fleet = await setFleetV2(player);
  if (fleet.type !== "Success") return fleet;

  const fleetCurrentSector = fleet.data.getCurrentSector();
  if (!fleetCurrentSector) return { type: "FleetCurrentSectorError" as const };

  // 3. set cargo and mining sector
  const starbase = await setStarbaseV2(fleet.data, true, "Choose the starbase destination:");
  if (starbase.type !== "Success") return starbase;

  const sector = player.getSageGame().getSectorByCoords(starbase.data.data.sector as SectorCoordinates);
  if (sector.type !== "Success") return sector;

  // const isSameSector = fleetCurrentSector.key.equals(sector.data.key);

  console.log(`Available resource names: ${Object.keys(ResourceName).join(", ")}`);

  // 4. set cargo resource allocation
  const resourcesGo = await setResourcesAmountV2(
    "Enter resources to freight in starbase DESTINATION (e.g., Carbon 5000), or press enter to skip:"
  );

  // 5. set mining resource
  const resourceToMine = await setResourceToMine(fleet.data, sector.data);
  if (resourceToMine.type !== "Success") return resourceToMine;

  const resourceToMineName = fleet.data.getSageGame().getResourcesMintNameByMint(resourceToMine.data.mineItem.data.mint);
  if (resourceToMineName.type !== "Success") return resourceToMineName;

  // calc fuel, ammo and food needed
  const miningSessionData = fleet.data.getTimeAndNeededResourcesToFullCargoInMining(resourceToMine.data);

  // 6. set fleet movement type (->)
  const movementGo = await setMovementTypeV2("(->)")

  const [goRoute, goFuelNeeded] = fleet.data.calculateRouteToSector(
    fleetCurrentSector.coordinates as SectorCoordinates, 
    sector.data.data.coordinates as SectorCoordinates,
    movementGo?.movement,
  );

  // 7. set fleet movement type (<-) 
  const movementBack = await setMovementTypeV2("(<-)")
  
  const [backRoute, backFuelNeeded] = fleet.data.calculateRouteToSector(
    sector.data.data.coordinates as SectorCoordinates, 
    fleetCurrentSector.coordinates as SectorCoordinates,
    movementBack?.movement,
  );
  
  const fuelNeeded = miningSessionData.fuelNeeded + (goFuelNeeded + Math.round(goFuelNeeded * 0.1)) + (backFuelNeeded + Math.round(backFuelNeeded * 0.1));
  // console.log("Fuel needed:", fuelNeeded);

  // 7. start combo loop
  for (let i = 0; i < cycles; i++) {
    const combo = await comboV2(
      fleet.data,
      resourceToMineName.data,
      fuelNeeded,
      miningSessionData.ammoNeeded,
      miningSessionData.foodNeeded,
      miningSessionData.timeInSeconds,
      resourcesGo,
      movementGo.movement,
      goRoute,
      goFuelNeeded,
      movementBack.movement,
      backRoute,
      backFuelNeeded,
    );
    if (combo.type !== "Success") {
      return combo;
    }
  }

  return { type: "Success" } as const;
}