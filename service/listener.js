const {App} = require('@slack/bolt');
const serviceTemplates = require('./templates.js');
const stateHome = require('./../state/home.js');
const stateSettings = require('./../state/settings.js');

module.exports = function (boltApp) {

    stateHome.init();

    const logResouorceStatusUppdate = async (client, userName, envName, isUsed) => {
        let msg = userName + (isUsed ? ' is using ' : ' released ') + envName
        let messageSettings = await stateSettings.getJson('messages')
        if (!messageSettings.channel) {
            return
        }
        try {
            await client.chat.postMessage({
                channel: messageSettings.channel,
                text: msg
            });
        } catch (error) {
            console.error(error);
        }
    }

    boltApp.message('ping', async ({message, say}) => {
        await say(`Pong <@${message.user}>: ` + new Date());
    })

    boltApp.event('app_home_opened', async ({event, client}) => {
        try {
            let envs_blocks = serviceTemplates('home/row', stateHome.getEnvs(), event.user.name);
            if (event.tab && event.tab === 'messages') {
                stateSettings.setJson('messages', event)
            }
            await client.views.publish({
                user_id: event.user,
                view: {
                    "type": "home",
                    "blocks": envs_blocks
                }
            });
        } catch (error) {
            console.error(error);
        }
    })

    const reRenderHome = async function (ack, body, client) {
        try {
            let envs_blocks = serviceTemplates('home/row', stateHome.getEnvs(), body.user.name);
            await client.views.update({
                view_id: body.view.id,
                hash: body.view.hash,
                view: {
                    type: 'home',
                    callback_id: 'view_1',
                    blocks: envs_blocks
                }
            });
        } catch (error) {
            console.error(error);
        }
    }

    boltApp.action('btn_use', async ({ack, body, client}) => {
        await ack();
        const selectedEnvName = body.actions[0].value;
        const userName = body.user.name
        let isUsed = stateHome.toggleEnvSatus(selectedEnvName, userName)
        reRenderHome(ack, body, client)
        logResouorceStatusUppdate(client, userName, selectedEnvName, isUsed)
    })

    boltApp.action('modal_schedule_open', async ({ack, body, client}) => {
        const selectedEnvName = body.actions[0].value
        try {
            let modal_schedule = serviceTemplates('modal/schedule', stateHome.getEnv(selectedEnvName));
            await client.views.open({
                trigger_id: body.trigger_id,
                view: modal_schedule
            });
        } catch (error) {
            console.error(error);
        }
    })

    boltApp.action('modal_schedule_timepicker_selected', async ({ack, body, client}) => {
        await ack();
        const envName = body.actions[0].block_id
        const userName = body.user.name
        const selectedTime = body.actions[0].selected_time

        stateHome.cacheReservedTime(envName, userName, selectedTime);
    })

    boltApp.view('modal_schedule', async ({ack, body, view, client}) => {
        await ack()
        const selectedEnvName = view.blocks[0].block_id

        stateHome.addReservedTime(selectedEnvName);
    })

    boltApp.action('remove_time', async ({ack, body, client}) => {
        await ack()
        let val = body.actions[0].value
        val = val.split('/')
        stateHome.removeReservedTime(val[0], val[1])
    });

    boltApp.action('btn_queue', async ({ack, body, client}) => {
        await ack()
        const envName = body.actions[0].value
        const userName = body.user.name
        stateHome.toggleQueue(envName, userName)
        reRenderHome(ack, body, client);
    });

    boltApp.action('btn_refresh', async ({ack, body, client}) => {
        await ack()
        reRenderHome(ack, body, client)
    });

    boltApp.command('/env_add', async ({ack, body, say}) => {
        await ack();
        let wasAddeed = stateHome.addEnv(body.text)
        await say(`"${body.text}" ` + (wasAddeed ? 'added' : 'can not be added'))
    });

    boltApp.command('/env_remove', async ({ack, body, say}) => {
        await ack()
        let wasDeleted = stateHome.removeEnv(body.text)
        await say(`"${body.text}" ` + (wasDeleted ? 'removed' : 'not found'))
    });

    boltApp.command('/env_use', async ({ack, body, say}) => {
        await ack()
        let envName = body.text
        if (!stateHome.isEnv(envName)) {
            await say(`"${envName}" not found`)
        } else if (stateHome.isEnvUsedBy(envName, body.user_name)) {
            await say(`"${envName}" is already used by you`)
        } else if (stateHome.isEnvUsed(envName)) {
            await say(`"${envName}" is already used smb else`)
        } else {
            let isUsed = stateHome.toggleEnvSatus(envName, body.user_name)
            await say(`"${body.text}" is ` + (isUsed ? 'used' : 'free') + ' now')
        }
    });

    boltApp.command('/env_free', async ({ack, body, say}) => {
        await ack()
        let envName = body.text
        if (!stateHome.isEnv(envName)) {
            await say(`"${envName}" not found`)
        } else if (!stateHome.isEnvUsed(envName)) {
            await say(`"${envName}" is free already`)
        } else {
            let isUsed = stateHome.toggleEnvSatus(envName, body.user_name)
            await say(`"${envName}" is ` + (isUsed ? 'used' : 'free') + ' now')
        }
    });

    boltApp.command('/env_queue', async ({ack, body, say}) => {
        await ack()
        let envName = body.text
        if (!stateHome.isEnv(envName)) {
            await say(`"${envName}" not found`)
        } else if (stateHome.isEnvUsedBy(envName, body.user_name)) {
            await say(`You can not add yourself to a queue for "${envName}" as it is already used by you `)
        } else if (!stateHome.isEnvUsed(envName)) {
            await say(`You can not add yourself to a queue for "${envName}" as it is free`)
        } else {
            let isAdded = stateHome.toggleQueue(envName, body.user_name)
            await say(`You ` + (isAdded ? 'added youself to' : 'removed yourself from') + ` a queue for "${envName}" `)
        }
    });

    boltApp.command('/env_list', async ({ack, body, say}) => {
        await ack()
        let list = stateHome.getEnvs().map(e => {
            return e.name + ': ' + (e.user === null ? 'free' : 'used by ' + e.user + (e.queue.length ? ', also waiting: ' + e.queue : ''))
        })
        await say(list.join("\n"))
    });
}
