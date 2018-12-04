<template>
    <div>
        <b-form @submit="onSubmit" @reset="onReset">
            <b-form-group label="Username"
                    label-for="username" 
            >
                <b-form-input
                    id="username"
                    type="text"
                    v-model="form.username"
                    required
                    autocomplete="username"
                    placeholder="Please enter your username"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group label="Password"
                    label-for="password" 
            >
                <b-form-input
                    id="password"
                    type="password"
                    v-model="form.password"
                    required
                    placeholder="Please enter your password"
                    autocomplete="current-password"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group>
                <b-form-checkbox id="staylogedin" v-model="form.stayLogedIn">
                    Stay logged in?
                </b-form-checkbox>
            </b-form-group>
            <b-form-group>
                <b-button type="submit" variant="primary">Submit</b-button>
                <b-button type="reset"  variant="danger" >Reset</b-button>
            </b-form-group>
        </b-form>
        Don't have an account jet? Click <router-link to="/register">register</router-link> to register.     
    </div>
</template>

<script>
    export default {
        props: [],
        methods: {
            onSubmit (evt) {
                evt.preventDefault();
                //TODO: Send to Backend
                this.axios
                .post(this.$config.RequestUriPrefix + '/api/v1/auth/sign-in',
                    {
                        username: this.form.username,
                        password: this.form.password,
                    },
                    {
                        withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                    })
                .then(response => {localStorage.token = response.data.token
                    this.axios
                        .get(this.$config.RequestUriPrefix + '/api/v1/auth/selftest',
                            {
                                headers: {'Authorization': "bearer " + localStorage.token},
                                withCredentials: true // CORS cookie issue: https://github.com/axios/axios/issues/876
                            })
                        .then(response => this.$router.push('/map'))
                        .catch(error => console.log(error.response));
                    }
                )
                .catch(error => console.log(error.response));
                
            },
            onReset (evt) {
                evt.preventDefault();
                /* Reset our form values */
                this.form.username = '';
                this.form.password = '';
                /* Trick to reset/clear native browser form validation state */
                this.show = false;
                this.$nextTick(() => { this.show = true });
            }
        },
        data: function () {
            return {
                form:{
                    username: '',
                    password: '',
                    stayLogedIn: false
                }
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>

</style>