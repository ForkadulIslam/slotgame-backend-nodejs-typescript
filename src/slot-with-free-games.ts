import {initializeUi} from "./ui/ui.js";
import {initializeData} from "./data.js";
import {
    customGameSession as session,
    customGameSessionSerializer as serializer,
    customScenarios as scenarios,
} from "./games/slot-with-free-games/index.js";

initializeData(session, serializer, scenarios);
initializeUi(document.getElementById("ui") as HTMLTableElement, scenarios as unknown as [string, string][]);
