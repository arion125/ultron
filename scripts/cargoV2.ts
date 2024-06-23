import { dockToStarbase } from "../actions/dockToStarbase";
import { loadCargo } from "../actions/loadCargo";
import { subwarpToSector } from "../actions/subwarpToSector";
import { undockFromStarbase } from "../actions/undockFromStarbase";
import { unloadCargo } from "../actions/unloadCargo";
import { warpToSector } from "../actions/warpToSector";
import { MAX_AMOUNT, MovementType } from "../common/constants";
import { NotificationMessage } from "../common/notifications";
import { InputResourcesForCargo } from "../common/types";
import { actionWrapper } from "../utils/actions/actionWrapper";
import { sendNotification } from "../utils/actions/sendNotification";
import { BN } from "@staratlas/anchor";
import { ResourceName } from "../src/SageGame";
import { CargoPodType, SageFleet, SectorRoute } from "../src/SageFleet";

export const cargoV2 = async (
  fleet: SageFleet,
  fuelNeeded: number,
  resourcesGo: InputResourcesForCargo[],
  movementGo: MovementType,
  goRoute: SectorRoute[],
  goFuelNeeded: number,
  resourcesBack: InputResourcesForCargo[],
  movementBack: MovementType,
  backRoute: SectorRoute[],
  backFuelNeeded: number,
) => {
    const fleetCurrentSector = fleet.getCurrentSector();
    if (!fleetCurrentSector) return { type: "FleetCurrentSectorError" as const };

    const fuelTank = fleet.getFuelTank();

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

    // console.log(fuelTank.loadedAmount.toNumber(), fuelNeeded)
    // 1. load fuel
    if (fuelTank.loadedAmount.lt(new BN(fuelNeeded))) {
      await actionWrapper(loadCargo, fleet, ResourceName.Fuel, CargoPodType.FuelTank, new BN(MAX_AMOUNT));
    }

    // 2. load cargo go
    const effectiveResourcesGo: InputResourcesForCargo[] = [];

    for (const item of resourcesGo) {
      var cargotype = CargoPodType.CargoHold
      if(item.resource == ResourceName.Ammo)
      {
        cargotype = CargoPodType.CargoHold
      }
      /*
      else if(item.resource == ResourceName.Fuel)
      {
        cargotype = CargoPodType.FuelTank
      }
        */
      const loading = await actionWrapper(loadCargo, fleet, item.resource, cargotype, new BN(item.amount));
      if (loading.type === "Success")
        effectiveResourcesGo.push(item);
    }
    
    // 4. undock from starbase
    await actionWrapper(undockFromStarbase, fleet);

    // 5. move to sector (->)
    if (movementGo === MovementType.Warp) {
      for (let i = 1; i < goRoute.length; i++) {
        const sectorTo = goRoute[i];
        const warp = await actionWrapper(warpToSector, fleet, sectorTo, goFuelNeeded,  i < goRoute.length - 1);
        if (warp.type !== "Success") {
            switch (warp.type){
              case "FleetIsDocked":
                await actionWrapper(undockFromStarbase, fleet);
                return warp
                break
            }
        }
      }   
    }

    if (movementGo === MovementType.Subwarp) {
      const sectorTo = goRoute[1];
      const subwarp = await actionWrapper(subwarpToSector, fleet, sectorTo, goFuelNeeded);
      if (subwarp.type !== "Success") {
        switch (subwarp.type){
          case "FleetIsDocked":
            await actionWrapper(undockFromStarbase, fleet);
            return subwarp
            break
        }
    }
    }

    // 6. dock to starbase
    await actionWrapper(dockToStarbase, fleet);

    // 7. unload cargo go
    for (const item of effectiveResourcesGo) {

      var cargotype = CargoPodType.CargoHold
      var amount = new BN(item.amount)
      if(item.resource == ResourceName.Ammo)
      {
        cargotype = CargoPodType.CargoHold
      }
      /*
      else if(item.resource == ResourceName.Fuel)
      {
        cargotype = CargoPodType.FuelTank
        amount = new BN(item.amount - backFuelNeeded)
      }*/
      const unloading = await actionWrapper(unloadCargo, fleet, item.resource, CargoPodType.CargoHold, amount);
    
    }
    
    // 8. load cargo back
    const effectiveResourcesBack: InputResourcesForCargo[] = [];
    
    for (const item of resourcesBack) {

      var cargotype = CargoPodType.CargoHold
      if(item.resource == ResourceName.Ammo)
      {
        cargotype = CargoPodType.CargoHold
      }
      /*
      else if(item.resource == ResourceName.Fuel)
      {
        cargotype = CargoPodType.FuelTank
      }
        */
      const loading = await actionWrapper(loadCargo, fleet, item.resource, cargotype, new BN(item.amount));
      if (loading.type === "Success")
        effectiveResourcesBack.push(item);  
    }

    // 9. undock from starbase
    await actionWrapper(undockFromStarbase, fleet);

    // 10. move to sector (<-)
    if (movementBack === MovementType.Warp) {
      for (let i = 1; i < backRoute.length; i++) {
        const sectorTo = backRoute[i];
        const warp = await actionWrapper(warpToSector, fleet, sectorTo, backFuelNeeded, i < backRoute.length - 1);
        if (warp.type !== "Success") {
          await actionWrapper(dockToStarbase, fleet);
          return warp;
        }
      }   
    }

    if (movementBack === MovementType.Subwarp) {
      const sectorTo = backRoute[1];
      const subwarp = await actionWrapper(subwarpToSector, fleet, sectorTo, backFuelNeeded);
      if (subwarp.type !== "Success") {
        await actionWrapper(dockToStarbase, fleet);
        return subwarp;
      }
    }

    // 11. dock to starbase
    await actionWrapper(dockToStarbase, fleet);

    // 12. unload cargo back
    for (const item of effectiveResourcesBack) {
      var cargotype = CargoPodType.CargoHold
      var amount = new BN(item.amount)
      if(item.resource == ResourceName.Ammo)
      {
        cargotype = CargoPodType.CargoHold
      }
      /*
      else if(item.resource == ResourceName.Fuel)
      {
        cargotype = CargoPodType.FuelTank
        amount = new BN(item.amount - backFuelNeeded)
      }*/
      const unloading = await actionWrapper(unloadCargo, fleet, item.resource, CargoPodType.CargoHold, amount);    
    }

    // 13. send notification
    await sendNotification(NotificationMessage.CARGO_SUCCESS, fleet.getName());

    return { type: "Success" as const };
};
