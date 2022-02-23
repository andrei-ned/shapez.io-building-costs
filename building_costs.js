// @ts-nocheck
const METADATA = {
    website: "https://github.com/andrei-ned/shapez.io-building-costs",
    author: "Darn",
    name: "Consumable buildings",
    version: "1",
    id: "consumable_buildings",
    description: "Makes each building cost a shape, based on the hub goals.",
    minimumGameVersion: ">=1.5.0",
    doesNotAffectSavegame: true,
};

// TODO: bump up prices

buildingCosts = {};

function getBuildingIdString(building, variant) {
    return building.id + "_" + variant;
}

function getBuildingIdFromEntity(entity) {
    const staticComp = entity.components.StaticMapEntity;
    const buildingData = shapez.getBuildingDataFromCode(staticComp.code);
    return getBuildingIdString(buildingData.metaInstance, buildingData.variant);
}

function addBuildingCostsEntry(building, variant, level) {
    const id = getBuildingIdString(building, variant);
    let costAmount = (
        level.throughputOnly ?
        shapez.findNiceIntegerValue(level.required * 50) :
        shapez.findNiceIntegerValue(level.required * 0.1)
    )
    costAmount = shapez.findNiceIntegerValue(Math.pow(costAmount, 1.1));
    buildingCosts[id] = { shape: level.shape, amount: costAmount };
}

const BlueprintPlacerExtension = ({ $super, $old }) => ({
    getCostDict() {
        const currentBlueprint = this.currentBlueprint.get();
        let costs = {};
        for (let i = 0; i < currentBlueprint.entities.length; ++i) {
            const entity = currentBlueprint.entities[i];
            const id = getBuildingIdFromEntity(entity);
            if (id in buildingCosts) {
                const shapeKey = buildingCosts[id].shape;
                const shapeAmount = buildingCosts[id].amount;
                if (!(shapeKey in costs)) {
                    costs[shapeKey] = 0;
                }
                costs[shapeKey] += shapeAmount;
            }
        }
        for (let key in costs) {
            costs[key] = shapez.findNiceIntegerValue(Math.pow(costs[key], 1.1));
        }
        return costs;
    },
});

class Mod extends shapez.Mod {
    init() {
        this.modInterface.extendClass(shapez.HUDBlueprintPlacer, BlueprintPlacerExtension);

        this.modInterface.runAfterMethod(shapez.GameCore, "initializeRoot", function() {
            // Get shape costs from level
            const levels = this.root.gameMode.getLevelDefinitions();
            for (let i = 0; i < levels.length; i++) {
                const lvl = levels[i];
                const contentUnlocked = shapez.enumHubGoalRewardsToContentUnlocked[lvl.reward];
                if (contentUnlocked) {
                    contentUnlocked.forEach(([metaBuildingClass, variant]) => {
                        const metaBuilding = shapez.gMetaBuildingRegistry.findByClass(metaBuildingClass);
                        addBuildingCostsEntry(metaBuilding, variant, lvl);
                    });
                }

                // Handle edge cases which don't get a cost for any variant
                switch(lvl.reward) {
                    case shapez.enumHubGoalRewards.reward_cutter_and_trash:
                        addBuildingCostsEntry(shapez.gMetaBuildingRegistry.findByClass(shapez.MetaTrashBuilding), "default", lvl);
                        break;
                    case shapez.enumHubGoalRewards.reward_virtual_processing:
                        addBuildingCostsEntry(shapez.gMetaBuildingRegistry.findByClass(shapez.MetaVirtualProcessorBuilding), "default", lvl);
                        addBuildingCostsEntry(shapez.gMetaBuildingRegistry.findByClass(shapez.MetaAnalyzerBuilding), "default", lvl);
                        addBuildingCostsEntry(shapez.gMetaBuildingRegistry.findByClass(shapez.MetaComparatorBuilding), "default", lvl);
                        break;
                    case shapez.enumHubGoalRewards.reward_logic_gates:
                        addBuildingCostsEntry(shapez.gMetaBuildingRegistry.findByClass(shapez.MetaTransistorBuilding), "default", lvl);
                        break;
                }
            }

            // Handle variants that didn't get a cost (e.g. mirrored painter, logic gates etc)
            for (const entry of shapez.gMetaBuildingRegistry.entries) {
                const metaclass = entry.constructor;
                const variants = metaclass.getAllVariantCombinations();

                for (let i = 0; i < variants.length; i++) {
                    const v = variants[i].variant;
                    const id = getBuildingIdString(entry, v);
                    if (!(id in buildingCosts)) {
                        // Check for variant that has cost
                        for (let j = i-1; j >= 0; j--) {
                            const prevV = variants[j].variant;
                            const prevId = getBuildingIdString(entry, prevV);
                            if (prevId in buildingCosts) {
                                buildingCosts[id] = buildingCosts[prevId];
                                break;
                            }
                        }
                    }
                }
            }
        });

        // Pin shape cost of active building variant
        this.modInterface.runAfterMethod(shapez.HUDBuildingPlacer, "initialize", function() {
            this.signals.variantChanged.add(function() {
                this.root.hud.parts.pinnedShapes.rerenderFull();
            }, this);
        });
        this.modInterface.runAfterMethod(shapez.HUDBuildingPlacer, "onSelectedMetaBuildingChanged", function() {
            this.root.hud.parts.pinnedShapes.rerenderFull();
        });
        this.modInterface.runAfterMethod(shapez.HUDPinnedShapes, "rerenderFull", function() {
            const metaBuilding = this.root.hud.parts.buildingPlacer.currentMetaBuilding.get();
            const variant = this.root.hud.parts.buildingPlacer.currentVariant.get();

            if (metaBuilding) {
                const id = getBuildingIdString(metaBuilding, variant);
                if (id in buildingCosts) {
                    this.internalPinShape({
                        key: buildingCosts[id].shape,
                        canUnpin: false,
                        className: "currency",
                    });
                }
            }
        });

        // Style currency icon and blueprint placer
        this.modInterface.registerCss(`
                #ingame_HUD_PinnedShapes .shape.currency::after {
                    content: " ";
                    position: absolute;
                    display: inline-block;
                    width: $scaled(8px);
                    height: $scaled(8px);
                    top: $scaled(4px);
                    left: $scaled(-7px);
                    background: url('${RESOURCES["currency.png"]}') center center / contain no-repeat;
                }

                .currencyIcon {
                    display: inline-block;
                    vertical-align: middle;
                    background: url('${RESOURCES["currency.png"]}') center center / contain no-repeat;
                }

                .currencyIcon.small {
                    width: $scaled(11px);
                    height: $scaled(11px);
                }

                #ingame_HUD_BlueprintPlacer {
                    width: auto;
                    max-width: $scaled(700px);
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                }

                #ingame_HUD_BlueprintPlacer .costContainer {
                    flex-wrap: wrap;
                    flex-direction: column;
                }

                #ingame_HUD_BlueprintPlacer .costContainer>canvas {
                    margin-left: 0;
                }

                .costContainer {
                    margin-left: $scaled(12px);
                }

                .canAfford {
                    color: white;
                }

                #shapeCost {
                    display: flex;
                }
            `);

        // Display shape cost in building placer HUD
        this.modInterface.runAfterMethod(shapez.HUDBuildingPlacer, "rerenderInfoDialog", function() {
            const metaBuilding = this.currentMetaBuilding.get();
            if (!metaBuilding) {
                return;
            }
            const variant = this.currentVariant.get();
            const id = getBuildingIdString(metaBuilding, variant);
            if (id in buildingCosts) {
                const shapeKey = buildingCosts[id].shape;
                const definition = this.root.shapeDefinitionMgr.getShapeFromShortKey(shapeKey);
                const canvas = definition.generateAsCanvas(35);
                // TODO: display amount of shapes once implemented
                this.buildingInfoElements.additionalInfo.innerHTML += `
                <label>Cost:</label>
                <span id='shapeCost'>${buildingCosts[id].amount}</span>
                `;
                const canvasContainer = shapez.makeDiv(this.element.querySelector("#shapeCost"), null, ["shape"]);
                canvasContainer.appendChild(canvas);
            }
        });

        // Only allow placing an entity when there is enough currency
        this.modInterface.replaceMethod(shapez.GameLogic, "checkCanPlaceEntity", function (
            $original,
            [entity, options]
        ) {
            const old = $original(entity, options);
            const id = getBuildingIdFromEntity(entity);
            if (id in buildingCosts) {
                const shapeKey = buildingCosts[id].shape;
                const storedInHub = this.root.hubGoals.storedShapes[shapeKey] || 0;
                if (storedInHub < buildingCosts[id].amount) {
                    return false;
                }
            }
            return old;
        });

        // Take shapes when placing a building
        this.modInterface.replaceMethod(shapez.GameLogic, "tryPlaceBuilding", function ($original, args) {
            const result = $original(...args);
            const id = getBuildingIdString(args[0].building, args[0].variant);
            if (id in buildingCosts) {
                const shapeKey = buildingCosts[id].shape;
                const shapeAmount = buildingCosts[id].amount;
                const storedInHub = this.root.hubGoals.storedShapes[shapeKey] || 0;
                if (storedInHub < shapeAmount) {
                    // Play sound when can't afford
                    this.root.soundProxy.playUi(shapez.SOUNDS.uiError);
                    // Alternative: show popup dialog
                    // this.root.hud.parts.dialogs.showWarning(
                    //     "Can't afford building",
                    //     "Not enough shapes to pay for building. Collect more of the required shape."
                    // );
                    return null;
                }
                if (result) {
                    this.root.hubGoals.storedShapes[shapeKey] -= shapeAmount;
                }
            }
            return result;
        });

        // Update can afford of blueprint
        this.modInterface.replaceMethod(shapez.HUDBlueprintPlacer, "update", function($original) {
            $original();
            const currentBlueprint = this.currentBlueprint.get();
            if (!currentBlueprint) {
                return;
            }
            const oldCanAfford = this.trackedCanAfford.get();
            if (!oldCanAfford) {
                return;
            }
            let newCanAfford = true;
            const costs = this.getCostDict();
            for (let [shapeKey, cost] of Object.entries(costs)) {
                const storedInHub = this.root.hubGoals.storedShapes[shapeKey] || 0;
                if (cost > storedInHub) {
                    newCanAfford = false;
                }
            }
            this.trackedCanAfford.set(oldCanAfford && newCanAfford)
        });

        // Show cost of all elements in blueprint placer HUD
        this.modInterface.replaceMethod(shapez.HUDBlueprintPlacer, "onBlueprintChanged", function($original, [blueprint]) {
            $original(blueprint);
            const pinnedShapes = this.root.hud.parts.pinnedShapes;
            if (!blueprint) {
                pinnedShapes.rerenderFull();
                return;
            }
            if (!blueprint.entities) {
                return;
            }

            const costs = this.getCostDict();
            while (this.costDisplayParent.childElementCount > 2) {
                this.costDisplayParent.lastChild.remove();
            }

            for (let [shapeKey, cost] of Object.entries(costs)) {
                const definition = this.root.shapeDefinitionMgr.getShapeFromShortKey(shapeKey);
                const canvas = definition.generateAsCanvas(80);
                const classes = ["costText"];
                const storedInHub = this.root.hubGoals.storedShapes[shapeKey] || 0;
                if (cost <= storedInHub) {
                    classes.push("canAfford");
                }
                const costContainer = shapez.makeDiv(this.costDisplayParent, null, ["costContainer"], "");
                const costDisplayText = shapez.makeDiv(costContainer, null, classes, "");
                costDisplayText.innerText = "" + cost;
                costContainer.appendChild(canvas);
            }

            // Pin shapes in blueprint
            pinnedShapes.rerenderFull();
            for (let key in costs) {
                pinnedShapes.internalPinShape({
                    key: key,
                    canUnpin: false,
                    className: "currency",
                });
            }
        });

        // Make default miner available (since the other one costs shapes)
        this.modInterface.replaceMethod(shapez.MetaMinerBuilding, "getAvailableVariants", function($original, [root]) {
            let variants = [shapez.defaultBuildingVariant]
            if (root.hubGoals.isRewardUnlocked(shapez.enumHubGoalRewards.reward_miner_chainable)) {
                variants.push(shapez.enumMinerVariants.chainable);
            }
            return variants;
        });

        // Show costs in unlock screen
        this.modInterface.replaceMethod(shapez.HUDUnlockNotification, "showForLevel", function($original, [level, reward]) {
            $original(level, reward);
            let hasBuilding = false;
            let metaBuilding = null;
            let buildingVariant = "default";
            const contentUnlocked = shapez.enumHubGoalRewardsToContentUnlocked[reward];
            if (contentUnlocked) {
                contentUnlocked.forEach(([metaBuildingClass, variant]) => {
                    metaBuilding = shapez.gMetaBuildingRegistry.findByClass(metaBuildingClass);
                    hasBuilding = true;
                    buildingVariant = variant;
                });
            }
            // Handle edge cases
            switch (level) {
                case shapez.enumHubGoalRewards.reward_virtual_processing:
                    metaBuilding = shapez.gMetaBuildingRegistry.findByClass(shapez.MetaVirtualProcessorBuilding);
                    hasBuilding = true;
                    break;
                case shapez.enumHubGoalRewards.reward_logic_gates:
                    metaBuilding = shapez.gMetaBuildingRegistry.findByClass(shapez.MetaTransistorBuilding);
                    hasBuilding = true;
                    break;
            }

            if (!hasBuilding) {
                return;
            }

            const id = getBuildingIdString(metaBuilding, buildingVariant);
            const shapeKey = buildingCosts[id].shape;
            const shapeAmount = buildingCosts[id].amount;
            const rewardDescElement = this.element.querySelector(".rewardDesc");
            const costDiv = shapez.makeDiv(rewardDescElement, null, [], `Buildings cost ${shapeAmount} <span></span> to place.`);
            const canvasHolder = costDiv.querySelector("span");
            const definition = this.root.shapeDefinitionMgr.getShapeFromShortKey(shapeKey);
            const canvas = definition.generateAsCanvas(35);
            canvasHolder.appendChild(canvas);
        });
    }
}

const RESOURCES = {
    "currency.png":
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAIAAAACAAF+ftPjAAAFwWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuZGFiYWNiYiwgMjAyMS8wNC8xNC0wMDozOTo0NCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIzLjAgKE1hY2ludG9zaCkiIHhtcDpDcmVhdGVEYXRlPSIyMDIyLTAxLTE2VDE2OjAzOjE1KzAxOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMi0wMS0xNlQxNjowNDowMyswMTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMi0wMS0xNlQxNjowNDowMyswMTowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6M2IxMTM4ZjEtNzdmMi00MzcyLTg4ZDktZTgzN2I4NzlkNGUwIiB4bXBNTTpEb2N1bWVudElE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",
};