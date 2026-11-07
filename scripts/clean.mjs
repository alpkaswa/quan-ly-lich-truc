import {rm} from 'node:fs/promises';
// Only rebuildable artifacts. Never delete D1, migrations, secrets or source.
for(const name of ['dist','worker-build'])await rm(new URL(`../${name}/`,import.meta.url),{recursive:true,force:true});
