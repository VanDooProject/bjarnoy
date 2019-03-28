<template>
    <div
        v-bind:style="{
            top: pos.y - size.y/2 + 'px',
            left: pos.x - size.x/2 + 'px',
            width: size.x + 'px',
            height: size.y + 'px',
            display: display,
            zIndex: 50000
        }"
        class="mapmenu"
    >
        <img src="/images/circle.png"
            v-bind:height="size.x"
            v-bind:width="size.y"
        />
        <div
            v-bind:style="{
                top:  size.y/2 + 'px',
                left: size.x/2 + 'px',
                }"
            class="mapmenu"
        >
            <menu-item
                v-bind:submenu="submenu.num"
                v-bind:type="submenu.type"
                v-bind:submenutotal="submenus1.length"
                v-bind:key="submenu.key"
                v-for="submenu in submenus1"
                submenulayer="1"
            >
            </menu-item><menu-item
                v-bind:submenu="submenu.num"
                v-bind:type="submenu.type"
                v-bind:submenutotal="submenus2.length"
                v-bind:key="submenu.key"
                v-for="submenu in submenus2"
                submenulayer="2"
            ></menu-item>
        </div>
    </div>
</template>

<script>
import MenuItem from "./menu_item.vue";
export default {
    props: [],
    components: {
        MenuItem
    },
    data: function() {
        return {
            size: { x: 150, y: 150 },
            submenus1: [{num: 1, type: {name: "build", isBuild: false}}, {num: 2, type: {name: "details", isBuild: false}}]
        };
    },
    computed: {
        submenus2() {
            if(this.$store.state.menuBuildOpen == true)
            {
                return this.$store.state.techBildings
                    .filter(entry => {
                        if(entry.resourcesNeeded.wood > this.$store.state.userResources.resourcesStoredCurrently.wood)
                        {
                            return false;
                        }
                        if(entry.resourcesNeeded.stone > this.$store.state.userResources.resourcesStoredCurrently.stone)
                        {
                            return false;
                        }
                        if(entry.resourcesNeeded.iron > this.$store.state.userResources.resourcesStoredCurrently.iron)
                        {
                            return false;
                        }
                        if(entry.resourcesNeeded.gold > this.$store.state.userResources.resourcesStoredCurrently.gold)
                        {
                            return false;
                        }


                        if(this.tile.building == undefined)
                        {
                            return (entry.allowedTiles.some(tile => ((entry.building.level == 1) && (tile.type == this.tile.type))));
                        }
                        else
                        {
                            if (entry.level > 1 && entry.level == this.tile.building.level + 1 && entry.type==this.tile.building.type)
                            {
                                return entry.allowedTiles.some(tile => tile.type == this.tile.type);
                            }
                            return false;
                        }
                    }).map((entry, index) => {
                        return { num: index, type: { name: entry.building.type, isBuild: true, level: entry.building.level} };
                    });
            }
            else
            {
                return [];
            }
        },
        tile() {
            return this.$store.state.menuTile;
        },
        pos() {
            return this.$store.state.menuPos;
        },
        display() {
            return this.$store.getters.menuDisplay;
        }
  },
  methods: {
    close: function(event) {
        this.$store.commit("SetMenuVisible", false);
    },
    clicked: function(event) {
        console.log(event);
    }
  },
  mounted() {
    // global close handler
    var self = this;
    document.onkeyup = function(event) {
        if (
            event.key == "Escape" ||
            event.code == "Escape" ||
            event.keyCode == 27
        ) {
            self.close();
        }
    };
  }
};
</script>

<style>
.mapmenu {
    position: absolute;
}
</style>