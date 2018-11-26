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
        <MenuItem v-bind:submenu=submenu v-bind:on-click-handler="clicked" v-bind:submenutotal=submenus.length v-bind:key=submenu.key v-for="submenu in submenus" submenulayer="1" ></MenuItem>
        </div>
        {{tile.x}} | {{tile.y}} | {{tile.z}}
    </div>
</template>

<script>
    import MenuItem from './menu_item.vue';
    export default {
        props:['pos', 'tile'],
        components: {
            MenuItem
        },
        data: function() {
            return {
                size: {x:150, y:150},
                submenus: [0,1,2,3,4,5]
            }
        },
        computed: {
            display() {
                var bHide = (this.pos.x == 0) && (this.pos.y == 0);
                return bHide ? 'none' : 'block';
            },
            //submenusize: this.submenus.size()
        },
        methods: {
            close: function(event) {
                this.pos.x = 0;
                this.pos.y = 0;
            },
            clicked: function(event)
            {
                console.log(event);
            }
        },
        mounted () {
            // global close handler
            var self = this;
            document.onkeyup = function(event) {
                if(event.key == "Escape" || event.code == "Escape" || event.keyCode == 27){
                    self.close();
                }
            }
        },
    }
</script>

<style>
.mapmenu {
    position: absolute;

    /*background-color: oldlace;*/
}
.mapmenu:hover {
    /*background-color: lightblue;*/
}
</style>