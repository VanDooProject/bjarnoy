<template>
    <div>
        <div v-bind:key="entry.id" v-for="entry in text"> 
            {{entry}} <br/>
        </div>
        <button @click=logout>logout</button>
    </div>    
</template>

<script>
    export default{
        data: function() {
            return {
                text: "",
            }
        },
        methods: {
            logout: function() {
                this.$store.dispatch("Logout");
            }
        },
        mounted() {
            this.axios
            .get(this.$config.RequestUriPrefix + '/api/v1/Profile/self/',
            {
                headers: {'Authorization': "bearer " + localStorage.token},
            })
            .then(response => {
                this.text = ["Username: " + response.data.username,
                            "Email: " + response.data.email,
                            "Created: " + response.data._id.creationTime];
            })
            .catch(error => this.$store.dispatch('ReqestError'));
        }
    }
</script>

<style>

</style>
