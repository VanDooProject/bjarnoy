# Adds the Mesa/Intel GPU userspace stack to the stock GitHub Actions runner
# image, so Chromium (launched by Playwright inside frontend-ci.yml's e2e
# job) can hit /dev/dri for real hardware-accelerated WebGL instead of
# falling back to SwiftShader software rendering. See docs/ci/e2e-sharding.md
# for why the e2e suite is CPU-bound today: it assumes "no GPU on the
# runner", which is true for GitHub-hosted VMs but not for this box.
#
# myoung34/github-runner is Ubuntu 22.04 (jammy)-based; if it moves to a
# different base, re-check these package names.
FROM myoung34/github-runner:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-dri \
    libglx-mesa0 \
    libegl1-mesa0 \
    libgbm1 \
    mesa-va-drivers \
    mesa-utils \
    && rm -rf /var/lib/apt/lists/*

# ENTRYPOINT/CMD are inherited from myoung34/github-runner unchanged — this
# image only adds packages, it doesn't change how the runner registers or
# starts.
