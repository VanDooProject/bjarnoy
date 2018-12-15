<template>
    <div>
        <b-form @submit="onSubmit" @reset="onReset">
            <b-form-group label="Email"
                    label-for="email" 
                    description="We'll never share your email with anyone else."
            >
                <b-form-input
                    id="email"
                    type="email"
                    v-model="form.email"
                    required
                    autocomplete="email"
                    placeholder="Please enter your email"
                >
                </b-form-input>
            </b-form-group>
            <b-form-group label="Username"
                label-for="username"
            >
                <b-form-input
                    id="username"
                    type="text"
                    v-model="form.username"
                    required
                    autocomplete="username"
                    placeholder="Please choose a username"
                >

                </b-form-input>
            </b-form-group>
            <b-form-group label="Password"
                    label-for="password"
                    :state="passwordCorrectState&&passwordVerifiedState"
            >
                <b-form-input
                    id="password"
                    type="password"
                    v-model="form.password"
                    required
                    :state="passwordCorrectState"
                    autocomplete="new-password"
                    placeholder="Please enter a password"
                >
                </b-form-input>
                <b-form-invalid-feedback>
                    <!-- This will only be shown if the preceeding input has an invalid state -->
                    Enter at least 3 letters<br/>
                </b-form-invalid-feedback>
                <b-form-input
                    type="password"
                    v-model="form.passwordVerify"
                    required
                    :state="passwordVerifiedState"
                    autocomplete="new-password"
                    placeholder="Please verify the password"
                >
                </b-form-input>
                <b-form-invalid-feedback id="inputLiveFeedback">
                    <!-- This will only be shown if the preceeding input has an invalid state -->
                    Passwords don't match
                </b-form-invalid-feedback>
            </b-form-group>
            <b-form-group>
                <b-form-checkbox id="staylogedin" v-model="form.stayLogedIn">
                    Stay logged in?
                </b-form-checkbox>
            </b-form-group>
            {{this.error}}
            <b-form-group>
                <b-button type="submit" variant="primary">Submit</b-button>
                <b-button type="reset"  variant="danger" >Reset</b-button>
            </b-form-group>
        </b-form>
        Already have an account? Click <router-link to="/login">login</router-link> to login.   
    </div>
</template>

<script>
    export default {
        props: [],
        methods: {

        },
        methods: {
            onSubmit (evt) {
                evt.preventDefault();
                //TODO: Verify inputs in frontend
                this.axios
                .post(this.$config.RequestUriPrefix + '/api/v1/auth/sign-up',
                    {
                        username: this.form.username,
                        password: this.form.password,
                        mail: this.form.email,
                        passwordConfirm: this.form.passwordVerify
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
                        .then(response => {this.$store.commit("logIn"); this.$router.push("/map")})
                        .catch(error => console.log(error.response));
                    }
                )
                .catch(error => {
                    this.error = error.response.data.Password[0] + ' <br/>' +
                        error.response.data.Username[0] + ' <br/>' +
                        error.response.data.PasswordConfirm[0] + ' <br/>';
                });
            },
            onReset (evt) {
                evt.preventDefault();
                /* Reset our form values */
                this.form.email = '';
                this.form.username = '';
                this.form.password = '';
                this.form.passwordVerify = '';
                this.error = ''
                /* Trick to reset/clear native browser form validation state */
                this.show = false;
                this.$nextTick(() => { this.show = true });
            }
        },
        computed: {
            passwordCorrectState: function () {
                //TODO: add Password requirements
                return true;
            },
            passwordVerifiedState: function () {
                //TODO: figure out how to stop submit if not correct (like email field)
                return this.form.password == this.form.passwordVerify
            }
        },
        data: function () {
            return {
                form: {
                    email: '',
                    password: '',
                    passwordVerify: '',
                    username: ''
                },
                error: ''
            }
        }
    }

    // https://forum.vuejs.org/t/debugging-vue-files-with-visual-studio-code/8022/5
    //# sourceURL=map_tile.vue
</script>

<style>

</style>