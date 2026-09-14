# Adds the Mesa/Intel GPU userspace stack to the stock GitHub Actions runner
# image, so Chromium (launched by Playwright inside frontend-ci.yml's e2e
# job) can hit /dev/dri for real hardware-accelerated WebGL instead of
# falling back to SwiftShader software rendering. See docs/ci/e2e-sharding.md
# for why the e2e suite is CPU-bound today: it assumes "no GPU on the
# runner", which is true for GitHub-hosted VMs but not for this box.
#
# myoung34/github-runner:latest is Ubuntu 20.04 (focal)-based (confirmed:
# the project's other tags are focal/jammy/noble/debian variants, and
# untagged "latest" is focal specifically) — pre-dating the Mesa
# multiarch-split package rename that only landed in Ubuntu 24.04 (noble).
# libglx-mesa0/libegl1-mesa0 don't exist on focal; these are focal's actual
# names. Re-check if this ever moves to a different base image/tag.
FROM myoung34/github-runner:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libegl1-mesa \
    libgbm1 \
    mesa-va-drivers \
    mesa-utils \
    && rm -rf /var/lib/apt/lists/*

# ENTRYPOINT/CMD are inherited from myoung34/github-runner unchanged — this
# image only adds packages, it doesn't change how the runner registers or
# starts.
