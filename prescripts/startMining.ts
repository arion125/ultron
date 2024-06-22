import { SectorCoordinates } from "../common/types";
import { miningV2 } from "../scripts/miningV2";
import { SagePlayer } from "../src/SagePlayer";
import { setCycles } from "../utils/inputs/setCycles";
import { setFleetV2 } from "../utils/inputsV2/setFleet";
import { setMovementTypeV2 } from "../utils/inputsV2/setMovementType";
import { setResourceToMine } from "../utils/inputsV2/setResourceToMine";
import { setStarbaseV2 } from "../utils/inputsV2/setStarbase";

export const startMining = async (player: SagePlayer) => {
  // 1. set cycles
  const cycles = await setCycles();

  // 2. set fleet
  const fleet = await setFleetV2(player);
  if (fleet.type !== "Success") return fleet;

  const fleetCurrentSector = fleet.data.getCurrentSector();
  if (!fleetCurrentSector) return { type: "FleetCurrentSectorError" as const };

  // 3. set mining sector
  const starbase = await setStarbaseV2(fleet.data, false, "Choose the starbase destination:");
  if (starbase.type !== "Success") return starbase;

  const sector = player.getSageGame().getSectorByCoords(starbase.data.data.sector as SectorCoordinates);
  if (sector.type !== "Success") return sector;

  const isSameSector = fleetCurrentSector.key.equals(sector.data.key);

  // 4. set mining resource
  const resourceToMine = await setResourceToMine(fleet.data, sector.data);
  if (resourceToMine.type !== "Success") return resourceToMine;

  const resourceToMineName = fleet.data.getSageGame().getResourcesMintNameByMint(resourceToMine.data.mineItem.data.mint);
  if (resourceToMineName.type !== "Success") return resourceToMineName;

  // calc fuel, ammo and food needed
  const miningSessionData = fleet.data.getTimeAndNeededResourcesToFullCargoInMining(resourceToMine.data);

  let movementGo, movementBack;
  if (!isSameSector) {
    // 5. set fleet movement type (->)
    movementGo = await setMovementTypeV2("(->)")

    // 6. set fleet movement type (<-) 
    movementBack = await setMovementTypeV2("(<-)")
  }

  // 5 & 6. calculate routes and fuel needed
  const [goRoute, goFuelNeeded] = fleet.data.calculateRouteToSector(
    fleetCurrentSector.coordinates as SectorCoordinates, 
    sector.data.data.coordinates as SectorCoordinates,
    movementGo?.movement,
  );
  
  const [backRoute, backFuelNeeded] = fleet.data.calculateRouteToSector(
    sector.data.data.coordinates as SectorCoordinates, 
    fleetCurrentSector.coordinates as SectorCoordinates,
    movementBack?.movement,
  );
  
  const fuelNeeded = miningSessionData.fuelNeeded + (goFuelNeeded + Math.round(goFuelNeeded * 0.1)) + (backFuelNeeded + Math.round(backFuelNeeded * 0.1));
  // console.log("Fuel needed:", fuelNeeded);

  // 7. start mining loop
  for (let i = 0; i < cycles; i++) {
    const mining = await miningV2(
      fleet.data,
      resourceToMineName.data,
      fuelNeeded,
      miningSessionData.ammoNeeded,
      miningSessionData.foodNeeded,
      miningSessionData.timeInSeconds,
      movementGo?.movement,
      goRoute,
      goFuelNeeded,
      movementBack?.movement,
      backRoute,
      backFuelNeeded,
    );
    if (mining.type !== "Success") {
      return mining;
    }
  }

  return { type: "Success" } as const;
}