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
                return bHide ? 'none' : 'block';
            }
        },
        methods: {
            close: function(event) {
                this.pos.x = 0;
                this.pos.y = 0;
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

    background-color: oldlace;
}
.mapmenu:hover {
    background-color: lightblue;
}
</style>