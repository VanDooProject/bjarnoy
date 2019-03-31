<template>
    <g>
        <image 
            v-bind:width=width
            v-bind:height=height
            v-bind:x="xpos"
            v-bind:y="ypos"

            v-bind:xlink:href=imgsrc
            
            class="tileimg"
        ></image>
        <polygon 
            v-bind:points="points"
            style="fill-opacity:0"

            v-on:mouseenter="openToolTip"
            v-on:mouseleave="closeToolTip"

            v-on:click="openMenu"
        />
        <g v-if="tileDebug">
            <text v-bind:x="(xpos+width/3)/3"
                v-bind:y="(ypos+height*5/8)/3"
                transform="scale(3)"
                style="user-select: none;"
                >
                ({{tile.position.x}}/{{tile.position.y}})
            </text>
            <text v-bind:x="(xpos+width/3)/3"
                v-bind:y="(ypos+height*5/8)/3+16"
                transform="scale(3)"
                v-if="tile.owner != undefined"
                style="user-select: none;"
                >
                {{tile.owner.displayName}}
            </text>
        </g>
        <transition name="fade">
            <foreignObject
                v-if="showTT"

                v-bind:x="xpos -200 + width/2"
                v-bind:y="ypos-ttHeight"
                v-bind:width="400"
                v-bind:height="ttHeight"
            >
                <div class="tiletooltip">
                    Type: {{tile.type}} {{tile.orientation}} ({{tile.position.x}}/{{tile.position.y}}) 
                    <div v-if="tile.resource!=undefined">
                        Resource: {{tile.resource.type}} Volume: {{tile.resource.resourceVolume}} Rate:{{tile.resource.degradationRate}}
                    </div>
                    <div v-if="tile.building!=undefined">
                        Building: {{tile.building.type}} Level {{tile.building.level}}
                    </div>
                </div>
            </foreignObject>
        </transition>
    </g>
</template>

<script>
export default {
    props: ["tile"],
    methods: {
        openMenu: function (event) {
            if (
                this.$store.state.mouseMove.x < 5 &&
                this.$store.state.mouseMove.y < 5
            ) {
                if (
                this.$store.state.menu.menuVisible == false &&
                this.$store.state.menu.menuClosed == false
                ) {
                this.$store.commit("menu/SetMenuPos", { x: event.pageX, y: event.pageY });
                this.$store.commit("menu/SetMenuTile", this.tile);
                this.$store.commit("menu/SetMenuVisible", true);
                }
            }
            this.$store.commit("menu/SetMenuClosed", false);
        },
        openToolTip: function () {
            this.showTT = true;
        },
        closeToolTip: function () {
            this.showTT = false;
        },
    },
    data: function () {
        return {
            showTT: false,
            imgWidth: 400,
            imgHeight: 600,
            angle: -45 * Math.PI / 180,

            xFactor: Math.SQRT2 * 3/4, // 3/4 comes from the geometry of stacking Hexagons
            yFactor: Math.SQRT2 * 3/4 / Math.sqrt(3) // sqrt(3) is also from the geometry
                    * Math.cos((57.8) / 180 * Math.PI), // the angle is from the Graphics
        };
    },
    computed: {
        tileDebug () {
            return this.$store.state.tileDebug;
        },
        ttHeight () {
            var height = 46;     //Textsize + 2 * Padding + BorderRadius (.tiletooltip)
            if(this.tile.resource!=undefined)
            {
                height+=26;      //Textsize + Padding (.tiletooltip)
            }
            if(this.tile.building!=undefined)
            {
                height+=26       //Textsize + Padding (.tiletooltip)
            }
            return height;
        },
        points () { // the point list for the hexagon that is used for mouse (and touch) events
            //x is straight forward
            //for y I have to add 47% of the height (Measured from Graphics ratio between the space below the first horizontal line and the hight of the image) 
            //because the actual graphics start there
            var xOff = this.xpos;
            var yOff = this.ypos + this.height * 0.47;

            var yFac = Math.sqrt(3)/2 //From the geometry
                * Math.cos((57.8) / 180 * Math.PI); //From the graphics

            return (xOff + this.width/4)    + "," + (yOff)                          + " "
                +  (xOff + this.width*3/4)  + "," + (yOff)                          + " "
                +  (xOff + this.width)      + "," + (yOff + this.width/2 * yFac)    + " "
                +  (xOff + this.width*3/4)  + "," + (yOff + this.width   * yFac)    + " "
                +  (xOff + this.width/4)    + "," + (yOff + this.width   * yFac)    + " "
                +  (xOff)                   + "," + (yOff + this.width/2 * yFac)    + " ";
        },
        xpos() {
            return this.width // use the (current) width to scale the vetor
                * (
                    // Rotate Coordinate system 45° and get x value
                        this.tile.position.x * Math.cos(this.angle) - this.tile.position.y * Math.sin(this.angle)
                ) 
                // Adjustment Factor
                * this.xFactor  
                // Add Offsets
                 // move reference point to center of image
                - this.width / 2 ;
        },
        ypos() {
            return this.width //use the (current) width to scale the vetor
                * (
                    //Rotate Coordinate system 45° and get y value
                    -this.tile.position.y * Math.cos(this.angle) - this.tile.position.x * Math.sin(this.angle)
                )
                // Adjustment Factor
                * this.yFactor
                // Add Offset
                // move reference point to center of image
                - this.height / 2;
        },
        windowWidth() {
            return this.$store.state.windowWidth;
        },
        windowHeight() {
            return this.$store.state.windowHeight;
        },
        width() {
            return this.imgWidth;
        },
        height() {
            return this.imgHeight;
        },
        imgsrc() { 
            //Hardcoded for testing
            if(this.tile.type == "water")
                return "images/hextiles/watertile_E.png";
            //return "images/hextiles/grasstile_E.png";

            let orientation = '';
            switch(this.tile.orientation) {
                case 'NorthEast' :
                    orientation = 'NE';
                    break;
                case 'East' :
                    orientation = 'E';
                    break;
                case 'SouthEast' :
                    orientation = 'SE';
                    break;
                case 'SouthWest' :
                    orientation = 'SW';
                    break;
                case 'West' :
                    orientation = 'W';
                    break;
                case 'NorthWest' :
                    orientation = 'NW';
                    break;
            }

            if(this.tile.building == undefined)
            {
                return "images/hextiles/" + this.tile.type.toLowerCase() + "_" + orientation + ".png";
            }
            else
            {
                return "images/hextiles/" + this.tile.building.type.toLowerCase() + "_" + orientation + "_level" + this.tile.building.level.toString().padStart(3,'0') + ".png";
            }
        }
    }
};

// https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
//# sourceURL=map_tile.vue
</script>

<style>
.tileimg {
    pointer-events: none;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .2s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
.tiletooltip {


    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 10px;
    border-radius: 10px;
    z-index: 0;
    font-size: 16px;
    pointer-events: none;

    /* noselect  https://stackoverflow.com/questions/826782/how-to-disable-text-selection-highlighting*/
    -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
       -khtml-user-select: none; /* Konqueror HTML */
         -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Non-prefixed version, currently
                                    supported by Chrome and Opera */
}
</style>