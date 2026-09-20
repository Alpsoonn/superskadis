# superskadis creator

A static, GitHub Pages-ready visual configurator and build-plate generator for the printable SKÅDIS parts in this repository.

## Run locally

Serve the repository with any static web server (for example, VS Code Live Server), then open `index.html`. A server is required because browsers block loading STL files through the `file://` protocol.

## Deploy

In the GitHub repository settings, set **Pages** to deploy from the `main` branch and the root folder. No build step is needed.

## Build plates

The build-plate generator reads the current bill of materials, keeps structural parts separate from connection hardware, and searches 45-degree rotations to minimize the number of plates. Bed dimensions, part spacing, and reserved brim are configurable and saved in the browser. Repeated plate contents are shown once with a print multiplier.

Every unique plate can be manually edited, repacked around locked parts, and exported as a combined STL with the bed center at X0 Y0. Files can be downloaded individually or written to a selected folder in browsers that support the File System Access API.
