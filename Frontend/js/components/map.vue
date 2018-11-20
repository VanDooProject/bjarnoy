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
                .get('http://localhost:15625/api/v1/map',
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => (this.users = response.data))
                .catch(error => console.log(error));
        }
    }
</script>

<style>


</style>