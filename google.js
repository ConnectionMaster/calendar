var vscode = require( 'vscode' );
var fs = require( 'fs' );
var google = require( 'googleapis' ).google;

var OPEN_SETTINGS = "Open Settings";
var GET_CODE = "Get Authorization Code";
var ENTER_CODE = "Enter Authorization Code";

var oAuth2Client;

function fetch( propulateTree, context, debug )
{
    var configuration = vscode.workspace.getConfiguration( 'calendar' );
    var credentialsFile = configuration.get( 'google.credentialsFile' );

    var SCOPES = [
        'https://www.googleapis.com/auth/calendar.events'
    ];

    if( !credentialsFile )
    {
        vscode.window.showInformationMessage( 'Please enable the google calendar API', OPEN_SETTINGS ).then( function( button )
        {
            if( button === OPEN_SETTINGS )
            {
                vscode.commands.executeCommand( 'workbench.action.openSettings', 'calendar.google.credentialsFile' ); 1
            }
        } );
    }
    else
    {
        debug( "Reading credentials from '" + credentialsFile + '"' );
        fs.readFile( credentialsFile, function( error, content )
        {
            if( error )
            {
                debug( error );
                vscode.window.showErrorMessage( 'Failed to open credentials file', OPEN_SETTINGS ).then( function( button )
                {
                    if( button === OPEN_SETTINGS )
                    {
                        vscode.commands.executeCommand( 'workbench.action.openSettings', 'calendar.google.credentialsFile' );
                    }
                } );
            }
            else
            {
                debug( "Authorizing" );
                // Authorize a client with credentials, then call the Google Calendar API.
                authorize( JSON.parse( content ), listEvents );
            }
        } );
    }

    /**
     * Create an OAuth2 client with the given credentials, and then execute the
     * given callback function.
     * @param {Object} credentials The authorization client credentials.
     * @param {function} callback The callback to call with the authorized client.
     */
    function authorize( credentials, callback )
    {
        var client_secret = credentials.installed.client_secret;
        var client_id = credentials.installed.client_id;
        var redirect_uris = credentials.installed.redirect_uris;

        oAuth2Client = new google.auth.OAuth2( client_id, client_secret, redirect_uris[ 0 ] );

        var token = context.globalState.get( 'calendar.google.token' );
        if( !token )
        {
            debug( "Getting token" );
            getAccessToken( oAuth2Client, callback );
            return;
        }
        else
        {
            debug( "Token already defined" );
            oAuth2Client.setCredentials( JSON.parse( token ) );
            callback();
        }

    }

    /**
     * Get and store new token after prompting for user authorization, and then
     * execute the given callback with the authorized OAuth2 client.
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     * @param {getEventsCallback} callback The callback for the authorized client.
     */
    function getAccessToken( oAuth2Client, callback )
    {
        var authUrl = oAuth2Client.generateAuthUrl( {
            access_type: 'offline',
            scope: SCOPES,
        } );
        debug( "token URL: " + authUrl );
        vscode.window.showInformationMessage( 'Google calendar authorization required', GET_CODE, ENTER_CODE ).then( function( action )
        {
            if( action === GET_CODE )
            {
                vscode.env.openExternal( vscode.Uri.parse( authUrl ) );
            }
            else if( action === ENTER_CODE )
            {
                vscode.window.showInputBox( { prompt: "Please enter the generated token", placeHolder: "Token" } ).then( function( code )
                {
                    oAuth2Client.getToken( code, function( error, token )
                    {
                        if( error )
                        {
                            vscode.window.showErrorMessage( 'Error retrieving access token: ' + error );
                        }
                        else
                        {
                            oAuth2Client.setCredentials( token );
                            context.globalState.update( 'calendar.google.token', JSON.stringify( token ) );
                            debug( "Token stored" );
                            callback();
                        }
                    } );
                } );
            }
        } );
    }

    function listEvents()
    {
        var configuration = vscode.workspace.getConfiguration( 'calendar' );

        var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
        calendar.events.list( {
            calendarId: 'primary',
            timeMin: ( new Date() ).toISOString(),
            maxResults: configuration.get( 'maxEvents' ),
            singleEvents: true,
            orderBy: 'startTime',
        }, function( error, results )
        {
            if( error )
            {
                vscode.window.showErrorMessage( error );
            }
            else
            {
                propulateTree( results.data.items );
            }
        } );
    }
}

function isAllDay( event )
{
    return event.start.date !== undefined;
}

function createEvent( summary, dateTime, debug, callback )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
    var event = {
        summary: summary,
        // location: '800 Howard St., San Francisco, CA 94103',
        // description: "A chance to hear more about Google's developer products.",
        start: {
            dateTime: dateTime
        },
        end: {
            dateTime: dateTime
        }
    };

    calendar.events.insert(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            resource: event
        },
        function( error, event )
        {
            if( error )
            {
                debug( 'Failed to create new event: ' + error );
            }
            else
            {
                debug( 'Event created' );
                callback();
            }
        }
    );
}

function editEvent( eventId, summary, dateTime, debug, callback )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );
    var event = {
        summary: summary,
        start: {
            dateTime: dateTime
        },
        end: {
            dateTime: dateTime
        }
    };

    calendar.events.update(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: eventId,
            resource: event
        },
        function( error, event )
        {
            if( error )
            {
                debug( 'Failed to update event: ' + error );
            }
            else
            {
                debug( 'Event updated' );
                callback();
            }
        }
    );

}

function deleteEvent( eventId, debug, callback )
{
    var calendar = google.calendar( { version: 'v3', auth: oAuth2Client } );

    calendar.events.delete(
        {
            auth: oAuth2Client,
            calendarId: 'primary',
            eventId: eventId
        },
        function( error, event )
        {
            if( error )
            {
                debug( 'Failed to delete event: ' + error );
            }
            else
            {
                debug( 'Event deleted' );
                callback();
            }
        }
    );
}

module.exports.fetch = fetch;
module.exports.isAllDay = isAllDay;
module.exports.createEvent = createEvent;
module.exports.editEvent = editEvent;
module.exports.deleteEvent = deleteEvent;