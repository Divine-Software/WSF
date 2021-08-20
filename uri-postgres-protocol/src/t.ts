import { DatabaseURI, FIELDS, URI } from '@divine/uri'
import { inspect } from 'util';

inspect.defaultOptions.depth = 10;

const db = new URI('pg://root@localhost:26257/leviticus') as DatabaseURI;

(async () => {
    const f = db.query(async () => {
        const q = await db.query(async () => {
            try {
                await db.query(async () => {
                    console.log(await db.$`#kv??one?(eq,key,9)`.load());
                    await db.$`#kv???(eq,key,9)`.remove();
                    console.log(await db.$`#kv??one?(eq,key,9)`.load());
                    await db.$`#kv`.append({ key: 9, value: '""'});
                    console.log(await db.$`#kv??one?(eq,key,9)`.load());
                    await db.$`#kv????key=key`.save({ key: 9, value: '["Martin"]'});
                    console.log(await db.$`#kv??one?(eq,key,9)`.load());
                    await db.$`#kv???(eq,key,9)`.modify({ value: '["Martin", "Nina"]'});
                    console.log(await db.$`#kv??one?(eq,key,9)`.load());
                    // console.log(await db.$`#kv;one?(eq,key,9)`.load());
                    // await db.$`#kv?(eq,key,9)`.remove();
                    // console.log(await db.$`#kv;one?(eq,key,9)`.load());
                    // await db.$`#kv`.append({ key: 9, value: '""'});
                    // console.log(await db.$`#kv;one?(eq,key,9)`.load());
                    // await db.$`#kv&key=key`.save({ key: 9, value: '["Martin"]'});
                    // console.log(await db.$`#kv;one?(eq,key,9)`.load());
                    // await db.$`#kv?(eq,key,9)`.modify({ value: '["Martin", "Nina"]'});
                    // console.log(await db.$`#kv;one?(eq,key,9)`.load());
                })
            }
            catch (err) {
                console.error('Failed: ' + err, err);
            }
        });

        return await db.query(async () => {
            const obj = {
                ts: Date.now(),
                date: new Date()
            };

            const r1 = await db.query`insert into kv values (${Date.now()}, ${obj}) returning *`;
            const r2 = await db.query(`select 1::int4 as one, 'text' as two, '{}'::json, key as nyckel, value as värde from kv where key < {limit} order by ${'key'} desc`, { limit: 1000 });

            return [r1, r2];
        });
    });

    return await f;
    // const g = db.query`select * from kv`;

    // return await Promise.all([f, g]);

})().then(console.log, console.error);
