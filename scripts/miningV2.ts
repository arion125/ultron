import { dockToStarbase } from "../actions/dockToStarbase";
import { loadCargo } from "../actions/loadCargo";
import { startMining } from "../actions/startMining";
import { stopMining } from "../actions/stopMining";
import { subwarpToSector } from "../actions/subwarpToSector";
import { undockFromStarbase } from "../actions/undockFromStarbase";
import { unloadCargo } from "../actions/unloadCargo";
import { warpToSector } from "../actions/warpToSector";
import { MAX_AMOUNT, MovementType } from "../common/constants";
import { NotificationMessage } from "../common/notifications";
import { actionWrapper } from "../utils/actions/actionWrapper";
import { sendNotification } from "../utils/actions/sendNotification";
import { BN } from "@staratlas/anchor";
import { ResourceName } from "../src/SageGame";
import { CargoPodType, SageFleet, SectorRoute } from "../src/SageFleet";

export const miningV2 = async (
  fleet: SageFleet,
  resourceToMine: ResourceName,
  fuelNeeded: number,
  ammoNeeded: number,
  foodNeeded: number,
  mineTime: number,
  movementGo?: MovementType,
  goRoute?: SectorRoute[],
  goFuelNeeded?: number,
  movementBack?: MovementType,
  backRoute?: SectorRoute[],
  backFuelNeeded?: number,
) => {
  const fleetCurrentSector = fleet.getCurrentSector();
  if (!fleetCurrentSector) return { type: "FleetCurrentSectorError" as const };

  const fuelTank = fleet.getFuelTank();

  const ammoBank = fleet.getAmmoBank();

  const cargoHold = fleet.getCargoHold();
  const [foodInCargoData] = cargoHold.resources.filter((item) => item.mint.equals(fleet.getSageGame().getResourcesMint().Food));

  if (new BN(fuelNeeded).gt(fuelTank.maxCapacity)) return { type: "NotEnoughFuelCapacity" as const };

  // 0. Dock to starbase (optional)
  if (
    !fleet.getCurrentState().StarbaseLoadingBay && 
    fleet.getSageGame().getStarbaseByCoords(fleetCurrentSector.coordinates).type === "Success"
  ) {
    await actionWrapper(dockToStarbase, fleet);
  } else if (
    !fleet.getCurrentState().StarbaseLoadingBay && 
    fleet.getSageGame().getStarbaseByCoords(fleetCurrentSector.coordinates).type !== "Success"
  ) {
    return fleet.getSageGame().getStarbaseByCoords(fleetCurrentSector.coordinates);
  }

  // 1. load fuel
  if (fuelTank.loadedAmount.lt(new BN(fuelNeeded))) {
    await actionWrapper(loadCargo, fleet, ResourceName.Fuel, CargoPodType.FuelTank, new BN(MAX_AMOUNT));
  }

  // 2. load ammo
  if (ammoBank.loadedAmount.lt(new BN(ammoNeeded))) {
    await actionWrapper(loadCargo, fleet, ResourceName.Ammo, CargoPodType.AmmoBank, new BN(MAX_AMOUNT));
  }

  // 3. load food
  if (foodInCargoData) {
    if (Number(foodInCargoData.amount || 0) < foodNeeded) {
      await actionWrapper(loadCargo, fleet, ResourceName.Food, CargoPodType.CargoHold, new BN(foodNeeded - Number(foodInCargoData.amount || 0)));
    }
  } else {
    await actionWrapper(loadCargo, fleet, ResourceName.Food, CargoPodType.CargoHold, new BN(foodNeeded));
  }
  
  // 4. undock from starbase
  await actionWrapper(undockFromStarbase, fleet);

  // 5. move to sector (->)
  if (movementGo && movementGo === MovementType.Warp && goRoute && goFuelNeeded) {
    for (let i = 1; i < goRoute.length; i++) {
      const sectorTo = goRoute[i];
      const warp = await actionWrapper(warpToSector, fleet, sectorTo, goFuelNeeded, i < goRoute.length - 1);
      if (warp.type !== "Success") {
        await actionWrapper(dockToStarbase, fleet);
        return warp;
      }
    }   
  }

  if (movementGo && movementGo === MovementType.Subwarp && goRoute && goFuelNeeded) {
    const sectorTo = goRoute[1];
    const subwarp = await actionWrapper(subwarpToSector, fleet, sectorTo, goFuelNeeded);
    if (subwarp.type !== "Success") {
      await actionWrapper(dockToStarbase, fleet);
      return subwarp;
    }
  }

  // 6. start mining
  await actionWrapper(startMining, fleet, resourceToMine, mineTime);

  // 7. stop mining
  await actionWrapper(stopMining, fleet, resourceToMine);

  // 8. move to sector (<-)
  if (movementBack && movementBack === MovementType.Warp && backRoute && backFuelNeeded) {
    for (let i = 1; i < backRoute.length; i++) {
      const sectorTo = backRoute[i];
      const warp = await actionWrapper(warpToSector, fleet, sectorTo, backFuelNeeded, true);
      if (warp.type !== "Success") {
        await actionWrapper(dockToStarbase, fleet);
        return warp;
      }
    }   
  }

  if (movementBack && movementBack === MovementType.Subwarp && backRoute && backFuelNeeded) {
    const sectorTo = backRoute[1];
    const subwarp = await actionWrapper(subwarpToSector, fleet, sectorTo, backFuelNeeded);
    if (subwarp.type !== "Success") {
      await actionWrapper(dockToStarbase, fleet);
      return subwarp;
    }
  }

  // 9. dock to starbase
  await actionWrapper(dockToStarbase, fleet);

  // 10. unload cargo
  await actionWrapper(unloadCargo, fleet, resourceToMine, CargoPodType.CargoHold, new BN(MAX_AMOUNT));

  // 11. unload food
  // await actionWrapper(unloadCargo, fleet.data, ResourceName.Food, CargoPodType.CargoHold, new BN(MAX_AMOUNT));

  // 12. send notification
  await sendNotification(NotificationMessage.MINING_SUCCESS, fleet.getName());

  return { type: "Success" as const };

}