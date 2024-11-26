
# var for branch name
variable "branch" {
  type = string
}

# setup the netlify provider;
# https://registry.terraform.io/providers/netlify/netlify/latest/docs
provider "netlify" {}

# create team and add a site for this branch
data "netlify_team" "team" {
  slug = "bg-frontend"
}

data "netlify_site" "site" {
  name    = "bg-frontend-${var.branch}"
}


# sites can't be created via terraform cause netlify is shit -> https://github.com/netlify/terraform-provider-netlify/issues/39
# free account also only allows 1 team - https://www.netlify.com/pricing/#pricing-table