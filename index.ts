#!/usr/bin/env node

import { version } from "./package.json";
import { SageGame } from "./src/SageGame";
import { SagePlayer } from "./src/SagePlayer";
import { getConnection } from "./utils/inputs/getConnection";
import { getKeypairFromSecret } from "./utils/inputs/getKeypairFromSecret";
import { inputProfile } from "./utils/inputs/inputProfile";
import { resetProfile } from "./utils/inputs/resetProfile";
import { setStart } from "./utils/inputs/setStart";
import { setupProfileData } from "./utils/inputs/setupProfileData";
import { setPriority } from "./utils/inputsV2/setPriority";
import { PriorityLevel } from "./common/constants";
import { setCustomPriority } from "./utils/inputsV2/setCustomPriority";
import { setActivityV2 } from "./utils/inputsV2/setActivity";
import { setPlayerProfile } from "./utils/inputsV2/setPlayerProfile";
import { startMining } from "./prescripts/startMining";
import { startCargo } from "./prescripts/startCargo";
import { startScan } from "./prescripts/startScan";
import { startCombo } from "./prescripts/startCombo";
import { startCraft } from "./prescripts/startCraft";
import { fetch, setGlobalDispatcher, Agent } from "undici"



const test = async () => {

  console.log(`Welcome to Ultron Copilot ${version}!`);
  console.log(`THIS IS A VERSION FOR CRAZY PEOPLE`);

  const { startOption } = await setStart();

  if (startOption === "Settings") {
    await resetProfile();
    return;
  }

  const sage = await (async () => {
    // qui l'utente configura il livello di priority fee desiderato e l'eventuale custom priority fee value
    const priorityFees = await setPriority();
    const { customPriority } = priorityFees.priority === PriorityLevel.Custom ? await setCustomPriority() : { customPriority: 0 }

    // qui l'utente sceglie il profilo desiderato
    const { profile } = await inputProfile();

    // qui si controlla se il profilo esiste già, se no, lo si crea
    await setupProfileData(profile);

    // qui si imposta la connessione
    const connection = getConnection(profile);

    // FIX: se la connessione non è andata a buon fine, Ultron riprova
    if (connection.type !== "Success") {
      console.log("Connection failed, please retry.")
      return;
    }

    // qui si imposta il keypir
    const keypair = await getKeypairFromSecret(profile);

    //allunghiamo il timeout per le fetch
    setGlobalDispatcher(new Agent({ connect: { timeout: 240_000 } }) )


    // 1. Setup environment (SageGame.ts) [keypair required]
    try {
      const game = await SageGame.init(keypair, connection.data, { level: priorityFees.priority, value: customPriority });
      return game;
    } catch (err) {
      return;
    }
  })();

  if (!sage) {
    console.log("Unable to initialize Sage Game. Check your configuration and network connection (IMPORTANT: this could also be an ongoing SAGE update or an rpc error).");
    return;
  }

  // 2. Setup player (SagePlayer.ts)
  const playerProfiles = await sage.getPlayerProfilesAsync();
  if (playerProfiles.type !== "Success") {
    console.log("Error getting player profiles.")
    return;
  }

  const playerProfile = playerProfiles.data.length == 1 ?
    playerProfiles.data[0] :
    (await setPlayerProfile(playerProfiles.data)).data;

  const player = await SagePlayer.init(sage, playerProfile);

  // 3. Check if player has enough Quattrini
  const qttrBalance = await sage.getQuattrinoBalance();
  if (qttrBalance.type !== "Success" || qttrBalance.data == 0) {
    console.log(qttrBalance.message)
    return;
  };

  console.log(qttrBalance.message)

  // 4. Set activity
  const activity = await setActivityV2();

  /* const userPoints = await player.getUserPointsAsync();
  if (userPoints.type !== "Success") return;
  console.log(userPoints.data) */

  switch (activity) {
    case "Mining":
      // 5. Play with mining
      const mining = await startMining(player);
      if (mining.type !== "Success") {
        console.log("Mining failed.", mining.type)
        return;
      }
      break;

    case "Cargo":
      // 6. Play with cargo
      const cargo = await startCargo(player);
      if (cargo.type !== "Success") {
        console.log("Cargo failed.", cargo.type)
        return;
      }
      break;

    case "Combo":
      // 7. Play with cargo mining
      const combo = await startCombo(player);
      if (combo.type !== "Success") {
        console.log("Combo failed.", combo.type)
        return;
      }
      break;

    case "Scan":
      // 8. Play with scanning
      const scan = await startScan(player);
      if (scan.type !== "Success") {
        console.log("\nScan failed.", scan.type)
        return;
      }
      break;

    case "Craft":
      // 9. Play with crafting (SageCrafting.ts)
      const craft = await startCraft(player);
      if (craft.type !== "Success") {
        console.log("\Craft failed.", craft.type)
        return;
      }
      break;

    default:
      return;
  }

  // 10. Play with galactic marketplace (GalacticMarketplace.ts)
  // ...

  /* const data = await sage.getPlanets()
  console.log(data) */

  /*  const data = await sage.getResourcesByPlanet(sage.getPlanets().find(item => item.data.planetType === PlanetType.AsteroidBelt)!)
   if (data.type !== "Success") throw new Error(data.type);
   console.log(sage.getResourceName(data.data[0])); */

  return;
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});