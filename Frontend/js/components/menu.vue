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
            tabindex="0"
            ref="mapmenu"
            v-on:keyup.esc="close"
        >
            pos = ( {{pos.x}} | {{ pos.y }} )
            
    </div>
</template>

<script>
    export default {
        props:['pos'],
        data: function() {
            return {
                size: {x:150, y:150}
            }
        },
        computed: {
            display() {
                var bHide = (this.pos.x == 0) && (this.pos.y == 0);
                //if(!bHide) {
                //    this.setFocus();
                //}
                return bHide ? 'none' : 'block';
            }
        },
        methods: {
            // https://codepen.io/CSWApps/pen/mmvJKE
            setFocus: function()
            {
                // https://stackoverflow.com/questions/47409672/vue-using-refs-to-focus-an-element-target
                this.$nextTick(function(){
                    this.$refs.mapmenu.focus();
                    console.log("set menu focus");
                });
            },
            close: function(event) {
                console.log("menu close event");
                this.pos.x = 0;
                this.pos.y = 0;
            }
        },
        mounted () {
            console.log("menu mounted");


            // global close handler
            var self = this;
            document.onkeyup = function(event) {
                console.log(event);
                if(event.key == "Escape" || event.code == "Escape" || event.keyCode == 27){
                    self.close();
                    console.log("esc pressed");
                }
            }
        },
    }
</script>

<style>
.mapmenu {
    position: absolute;

    background-color: oldlace;
}
.mapmenu:hover {
    background-color: lightblue;
}
</style>