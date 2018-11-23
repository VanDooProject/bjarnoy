<template>
    <div>
        <h1>Map</h1>
    </div>
</template>

<script>
    module.exports = {
        props: [],
        data: function() {
            return {
                // will be a three-dimensional array with map coords
                tiles: [],
            }
        },
        methods: {

        },
        mounted () {
            this.axios
                // TODO: use global server config
                .get('http://localhost:41527/api/v1/map/demo',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => ( this.tiles = response.data))
                .catch(error => console.log(error));
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map.vue
</script>

<style>


</style>