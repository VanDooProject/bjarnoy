<template>
    <g>
        <foreignObject x=5 y=32 width=32 height=32 v-on:click="zoomPlus" ><div class=zoombutton>+</div></foreignObject>
        <foreignObject x=5 y=70 width=32 height=32 v-on:click="zoomMinus"><div class=zoombutton>-</div></foreignObject>
    </g>
</template>

<script>

export default {
    props: [],
    components: {
        
    },
    data: function() {
        return {

        };
    },
    computed: {
        mapScale() {
            return this.$store.state.mapScale;
        },
    },
    methods: {
       zoomPlus()
       {
           this.$store.commit("AddMapScale", this.mapScale /8);
       },
       zoomMinus()
       {
           this.$store.commit("AddMapScale", -this.mapScale /8);
       },
    },
    mounted() {

    }
};
</script>

<style>
.zoombutton {
    background: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.8);
    padding: 0;
    border-radius: 2px;
    text-align: center;
    z-index: 0;
    font-size: 30px;
    line-height: 32px;

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
